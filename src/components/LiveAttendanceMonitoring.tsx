import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Download, Users, Clock, MapPin, UserCheck, User, Calendar, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface UserInfo {
  id: string;
  full_name: string;
  username: string;
}

interface AttendanceData {
  id: string; user_id: string; date: string; check_in_time: string | null; check_out_time: string | null;
  total_hours: number | null; status: string; check_in_location: any; check_out_location: any;
  check_in_address: string | null; check_out_address: string | null;
  profiles?: { full_name: string; username: string } | null;
  active_market_hours?: number | null;
}

interface SummaryStats {
  totalPresent: number; totalAbsent: number; totalHalfDay: number; totalOnLeave: number; averageHours: number; totalEmployees: number;
}

const LiveAttendanceMonitoring = () => {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [attendanceData, setAttendanceData] = useState<AttendanceData[]>([]);
  const [filteredData, setFilteredData] = useState<AttendanceData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('day');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({ totalPresent: 0, totalAbsent: 0, totalHalfDay: 0, totalOnLeave: 0, averageHours: 0, totalEmployees: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showLocationId, setShowLocationId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchAttendanceData();
    const channel = supabase.channel('attendance-monitoring').on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchAttendanceData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { applyFilters(); }, [attendanceData, selectedUsers, searchQuery, dateFilter, startDateFilter, endDateFilter]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('id, full_name, username').order('full_name');
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchAttendanceData = async () => {
    try {
      setIsLoading(true);
      const { data: attendance } = await supabase.from('attendance').select('*').gte('date', format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')).order('date', { ascending: false });
      const { data: allUsers } = await supabase.from('profiles').select('id, full_name, username');

      if (allUsers) {
        const result: AttendanceData[] = [];
        attendance?.forEach(record => {
          const profile = allUsers.find(u => u.id === record.user_id);
          let activeMarketHours = null;
          if (record.check_in_time && record.check_out_time) {
            activeMarketHours = (new Date(record.check_out_time).getTime() - new Date(record.check_in_time).getTime()) / (1000 * 60 * 60);
          }
          result.push({ ...record, profiles: profile ? { full_name: profile.full_name, username: profile.username } : null, active_market_hours: activeMarketHours });
        });

        const today = format(new Date(), 'yyyy-MM-dd');
        const usersWithAttendanceToday = (attendance || []).filter(a => a.date === today).map(a => a.user_id);
        allUsers.forEach(user => {
          if (!usersWithAttendanceToday.includes(user.id)) {
            result.push({ id: `absent-${user.id}-${today}`, user_id: user.id, date: today, check_in_time: null, check_out_time: null, total_hours: null, status: 'absent', check_in_location: null, check_out_location: null, check_in_address: null, check_out_address: null, profiles: { full_name: user.full_name, username: user.username }, active_market_hours: null });
          }
        });
        setAttendanceData(result);
      }
    } catch (error) { toast.error('Failed to fetch attendance data'); } finally { setIsLoading(false); }
  };

  const applyFilters = () => {
    let filtered = [...attendanceData];

    // Filter by selected users
    if (selectedUsers.length > 0) {
      filtered = filtered.filter(r => selectedUsers.includes(r.user_id));
    }

    if (searchQuery) filtered = filtered.filter(r => r.profiles?.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || r.profiles?.username.toLowerCase().includes(searchQuery.toLowerCase()));
    const today = new Date();
    if (dateFilter === 'day') filtered = filtered.filter(r => r.date === format(today, 'yyyy-MM-dd'));
    else if (dateFilter === 'week') filtered = filtered.filter(r => r.date >= format(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7), 'yyyy-MM-dd'));
    else if (dateFilter === 'month') filtered = filtered.filter(r => r.date >= format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'));
    else if (dateFilter === 'range' && startDateFilter && endDateFilter) filtered = filtered.filter(r => r.date >= startDateFilter && r.date <= endDateFilter);
    setFilteredData(filtered);

    const todaysData = filtered.filter(r => r.date === format(today, 'yyyy-MM-dd'));
    const totalPresent = todaysData.filter(r => r.status === 'present' || r.status === 'regularized').length;
    const totalAbsent = todaysData.filter(r => r.status === 'absent').length;
    const totalOnLeave = todaysData.filter(r => r.status === 'leave').length;
    const totalHalfDay = todaysData.filter(r => r.status === 'half-day').length;
    const presentData = todaysData.filter(r => (r.status === 'present' || r.status === 'regularized') && r.total_hours);
    const averageHours = presentData.length > 0 ? presentData.reduce((s, r) => s + (r.total_hours || 0), 0) / presentData.length : 0;
    setSummaryStats({ totalPresent, totalAbsent, totalHalfDay, totalOnLeave, averageHours, totalEmployees: todaysData.length });
  };

  const handleUserSelection = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers(prev => [...prev, userId]);
    } else {
      setSelectedUsers(prev => prev.filter(id => id !== userId));
    }
  };

  const handleSelectAll = () => {
    const filteredUsersList = users.filter(user =>
      user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.username.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSelectedUsers(filteredUsersList.map(user => user.id));
  };

  const handleClearSelection = () => {
    setSelectedUsers([]);
  };

  const exportData = () => {
    const csv = ['Employee,Date,Check In,Check Out,Hours,Status', ...filteredData.map(r => [r.profiles?.full_name || 'Unknown', r.date, r.check_in_time ? format(new Date(r.check_in_time), 'HH:mm') : '--', r.check_out_time ? format(new Date(r.check_out_time), 'HH:mm') : '--', r.active_market_hours ? `${r.active_market_hours.toFixed(1)}h` : '--', r.status].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `attendance-report-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { cls: string; label: string }> = {
      present: { cls: 'bg-green-100 text-green-800', label: 'Present' },
      regularized: { cls: 'bg-blue-100 text-blue-800', label: 'Regularized' },
      absent: { cls: 'bg-red-100 text-red-800', label: 'Absent' },
      'half-day': { cls: 'bg-amber-100 text-amber-800', label: 'Half Day' },
      leave: { cls: 'bg-purple-100 text-purple-800', label: 'On Leave' },
    };
    const c = config[status] || { cls: 'bg-muted text-muted-foreground', label: status };
    return <Badge className={c.cls}>{c.label}</Badge>;
  };

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Total Employees</CardTitle><Users className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summaryStats.totalEmployees}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Present Today</CardTitle><UserCheck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-700 dark:text-green-400">{summaryStats.totalPresent}</div>{summaryStats.totalEmployees > 0 && <p className="text-xs text-muted-foreground mt-1">{Math.round((summaryStats.totalPresent / summaryStats.totalEmployees) * 100)}% attendance</p>}</CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Absent Today</CardTitle><User className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{summaryStats.totalAbsent}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">On Leave</CardTitle><Calendar className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{summaryStats.totalOnLeave + summaryStats.totalHalfDay}</div>{summaryStats.totalHalfDay > 0 && <p className="text-xs text-muted-foreground mt-1">{summaryStats.totalHalfDay} half-day</p>}</CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Avg Hours</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{summaryStats.averageHours.toFixed(1)}h</div><p className="text-xs text-muted-foreground mt-1">per present employee</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Filter & Search</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" /><Input placeholder="Search users by name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" /></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div><Label>View Period</Label><Select value={dateFilter} onValueChange={v => { setDateFilter(v); if (v !== 'range') { setStartDateFilter(''); setEndDateFilter(''); } }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem><SelectItem value="range">Date Range</SelectItem></SelectContent></Select></div>
            {dateFilter === 'range' && <>
              <div><Label>Start Date</Label><Input type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} /></div>
              <div><Label>End Date</Label><Input type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} /></div>
            </>}
          </div>

          {/* User Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Select Users ({selectedUsers.length} selected)</Label>
              <div className="space-x-2">
                <Button variant="outline" size="sm" onClick={handleSelectAll}>Select All</Button>
                <Button variant="outline" size="sm" onClick={handleClearSelection}>Clear</Button>
              </div>
            </div>
            <Select onValueChange={(value) => handleUserSelection(value, !selectedUsers.includes(value))}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select users to monitor..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {filteredUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span>{user.full_name} ({user.username})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedUsers.length > 0 && (
              <div className="mt-2 p-2 bg-muted rounded">
                <div className="text-xs text-muted-foreground mb-1">Selected users:</div>
                <div className="flex flex-wrap gap-1">
                  {selectedUsers.map(userId => {
                    const user = users.find(u => u.id === userId);
                    return user ? (
                      <div key={userId} className="flex items-center gap-1 bg-background px-2 py-1 rounded text-xs">
                        <span>{user.full_name}</span>
                        <button onClick={() => handleUserSelection(userId, false)} className="text-destructive hover:text-destructive/80">×</button>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end"><Button onClick={exportData} className="flex items-center gap-2"><Download className="h-4 w-4" />Export Data</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Live Attendance Data</CardTitle><CardDescription>Real-time attendance monitoring</CardDescription></CardHeader>
        <CardContent>
          {isLoading ? <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : (
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>First Check In</TableHead><TableHead>Last Check Out</TableHead><TableHead>Active Market Hours</TableHead><TableHead>Check In Location</TableHead><TableHead>Check Out Location</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredData.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.profiles?.full_name || 'Unknown'}</TableCell>
                    <TableCell>{format(new Date(r.date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{r.check_in_time ? <div className="flex items-center gap-1"><Clock className="h-4 w-4 text-muted-foreground" />{format(new Date(r.check_in_time), 'HH:mm')}</div> : '--'}</TableCell>
                    <TableCell>{r.check_out_time ? <div className="flex items-center gap-1"><Clock className="h-4 w-4 text-muted-foreground" />{format(new Date(r.check_out_time), 'HH:mm')}</div> : '--'}</TableCell>
                    <TableCell>{r.active_market_hours ? `${r.active_market_hours.toFixed(1)}h` : '--'}</TableCell>
                    <TableCell>
                      {r.check_in_location ? (
                        <div className="relative">
                          <button onClick={() => setShowLocationId(showLocationId === `${r.id}-checkin` ? null : `${r.id}-checkin`)} className="text-primary hover:text-primary/80"><MapPin className="h-5 w-5" /></button>
                          {showLocationId === `${r.id}-checkin` && <div className="absolute z-10 mt-1 p-2 bg-popover border rounded-md shadow-lg text-xs whitespace-nowrap"><div className="font-medium">{r.check_in_address || 'Unknown Location'}</div><div className="text-muted-foreground">Lat: {r.check_in_location.latitude?.toFixed(4)}, Lng: {r.check_in_location.longitude?.toFixed(4)}</div></div>}
                        </div>
                      ) : '--'}
                    </TableCell>
                    <TableCell>
                      {r.check_out_location ? (
                        <div className="relative">
                          <button onClick={() => setShowLocationId(showLocationId === `${r.id}-checkout` ? null : `${r.id}-checkout`)} className="text-primary hover:text-primary/80"><MapPin className="h-5 w-5" /></button>
                          {showLocationId === `${r.id}-checkout` && <div className="absolute z-10 mt-1 p-2 bg-popover border rounded-md shadow-lg text-xs whitespace-nowrap"><div className="font-medium">{r.check_out_address || 'Unknown Location'}</div><div className="text-muted-foreground">Lat: {r.check_out_location.latitude?.toFixed(4)}, Lng: {r.check_out_location.longitude?.toFixed(4)}</div></div>}
                        </div>
                      ) : '--'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && filteredData.length === 0 && <div className="text-center py-8 text-muted-foreground">No attendance data found.</div>}
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveAttendanceMonitoring;
