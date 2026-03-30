import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Search, Download, Users, Clock, MapPin, UserCheck, User, Calendar, TrendingUp, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { downloadCSVString } from '@/utils/nativeDownload';

interface UserInfo {
  id: string;
  full_name: string;
  username: string;
}

interface AttendanceData {
  id: string; user_id: string; date: string; check_in_time: string | null; check_out_time: string | null;
  total_hours: number | null; status: string; check_in_location: any; check_out_location: any;
  check_in_address: string | null; check_out_address: string | null;
  check_in_photo_url: string | null; check_out_photo_url: string | null;
  face_match_confidence: number | null; face_match_confidence_out: number | null;
  profiles?: { full_name: string; username: string } | null;
  active_market_hours?: number | null;
  signed_photo_url?: string | null;
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
  const [detailRecord, setDetailRecord] = useState<AttendanceData | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchAttendanceData();
    const channel = supabase.channel('attendance-monitoring')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchAttendanceData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => { fetchUsers(); fetchAttendanceData(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => { applyFilters(); }, [attendanceData, selectedUsers, searchQuery, dateFilter, startDateFilter, endDateFilter]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('id, full_name, username').eq('is_active', true).order('full_name');
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const getSignedUrl = async (url: string): Promise<string | null> => {
    if (!url) return null;
    try {
      // Extract the storage path from a full Supabase URL
      // URLs look like: .../storage/v1/object/public/attendance-photos/PATH or .../object/sign/attendance-photos/PATH?token=...
      let storagePath = url;
      if (url.startsWith('http')) {
        const match = url.match(/attendance-photos\/(.+?)(?:\?|$)/);
        if (match) {
          storagePath = match[1];
        } else {
          return url; // Can't parse, return as-is
        }
      }
      const { data } = await supabase.storage.from('attendance-photos').createSignedUrl(storagePath, 300);
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  };

  const fetchAttendanceData = async () => {
    try {
      setIsLoading(true);
      const { data: attendance } = await supabase.from('attendance').select('*').gte('date', format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')).order('date', { ascending: false });
      const { data: allUsers } = await supabase.from('users').select('id, full_name, username').eq('is_active', true);

      if (allUsers) {
        const result: AttendanceData[] = [];
        const signedUrlPromises: Promise<void>[] = [];

        attendance?.forEach(record => {
          const profile = allUsers.find(u => u.id === record.user_id);
          let activeMarketHours = null;
          if (record.check_in_time && record.check_out_time) {
            activeMarketHours = (new Date(record.check_out_time).getTime() - new Date(record.check_in_time).getTime()) / (1000 * 60 * 60);
          }
          const entry: AttendanceData = { ...record, profiles: profile ? { full_name: profile.full_name, username: profile.username } : null, active_market_hours: activeMarketHours, signed_photo_url: null };
          result.push(entry);

          if (record.check_in_photo_url) {
            signedUrlPromises.push(
              getSignedUrl(record.check_in_photo_url).then(url => { entry.signed_photo_url = url; })
            );
          }
        });

        // Resolve signed URLs in parallel
        await Promise.allSettled(signedUrlPromises);

        const today = format(new Date(), 'yyyy-MM-dd');
        const usersWithAttendanceToday = (attendance || []).filter(a => a.date === today).map(a => a.user_id);
        allUsers.forEach(user => {
          if (!usersWithAttendanceToday.includes(user.id)) {
            result.push({ id: `absent-${user.id}-${today}`, user_id: user.id, date: today, check_in_time: null, check_out_time: null, total_hours: null, status: 'absent', check_in_location: null, check_out_location: null, check_in_address: null, check_out_address: null, check_in_photo_url: null, check_out_photo_url: null, face_match_confidence: null, face_match_confidence_out: null, profiles: { full_name: user.full_name, username: user.username }, active_market_hours: null, signed_photo_url: null });
          }
        });
        setAttendanceData(result);
      }
    } catch (error) { toast.error('Failed to fetch attendance data'); } finally { setIsLoading(false); }
  };

  const applyFilters = () => {
    let filtered = [...attendanceData];
    if (selectedUsers.length > 0) filtered = filtered.filter(r => selectedUsers.includes(r.user_id));
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
    if (checked) setSelectedUsers(prev => [...prev, userId]);
    else setSelectedUsers(prev => prev.filter(id => id !== userId));
  };

  const handleSelectAll = () => {
    const filteredUsersList = users.filter(user => user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) || user.username.toLowerCase().includes(searchQuery.toLowerCase()));
    setSelectedUsers(filteredUsersList.map(user => user.id));
  };

  const handleClearSelection = () => setSelectedUsers([]);

  const exportData = () => {
    const csv = ['Employee,Date,Check In,Check Out,Hours,Status,Face Match In', ...filteredData.map(r => [r.profiles?.full_name || 'Unknown', r.date, r.check_in_time ? format(new Date(r.check_in_time), 'HH:mm') : '--', r.check_out_time ? format(new Date(r.check_out_time), 'HH:mm') : '--', r.active_market_hours ? `${r.active_market_hours.toFixed(1)}h` : '--', r.status, r.face_match_confidence != null ? `${Math.round(r.face_match_confidence)}%` : '--'].join(','))].join('\n');
    downloadCSVString(csv, `attendance-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
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

  const FaceMatchBadge = ({ confidence }: { confidence: number | null }) => {
    if (confidence == null) return <span className="text-xs text-muted-foreground">--</span>;
    const isGood = confidence >= 70;
    return (
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isGood ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {isGood ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {Math.round(confidence)}%
      </div>
    );
  };

  const filteredUsers = users.filter(user =>
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Employees</CardTitle>
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0"><div className="text-xl sm:text-2xl font-bold">{summaryStats.totalEmployees}</div></CardContent>
        </Card>
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Present Today</CardTitle>
            <UserCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-green-700 dark:text-green-400">{summaryStats.totalPresent}</div>
            {summaryStats.totalEmployees > 0 && <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{Math.round((summaryStats.totalPresent / summaryStats.totalEmployees) * 100)}% attendance</p>}
          </CardContent>
        </Card>
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Absent Today</CardTitle>
            <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0"><div className="text-xl sm:text-2xl font-bold text-destructive">{summaryStats.totalAbsent}</div></CardContent>
        </Card>
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">On Leave</CardTitle>
            <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-400">{summaryStats.totalOnLeave + summaryStats.totalHalfDay}</div>
            {summaryStats.totalHalfDay > 0 && <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{summaryStats.totalHalfDay} half-day</p>}
          </CardContent>
        </Card>
        <Card className="p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-6 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium">Avg Hours</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 sm:p-6 pt-0">
            <div className="text-xl sm:text-2xl font-bold text-primary">{summaryStats.averageHours.toFixed(1)}h</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">per present employee</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="p-3 sm:p-6"><CardTitle className="text-sm sm:text-lg">Filter & Search</CardTitle></CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
          <div className="relative"><Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" /><Input placeholder="Search users by name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 h-9 sm:h-10 text-sm" /></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
            <div><Label className="text-xs sm:text-sm">View Period</Label><Select value={dateFilter} onValueChange={v => { setDateFilter(v); if (v !== 'range') { setStartDateFilter(''); setEndDateFilter(''); } }}><SelectTrigger className="h-9 sm:h-10 text-xs sm:text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="day">Today</SelectItem><SelectItem value="week">This Week</SelectItem><SelectItem value="month">This Month</SelectItem><SelectItem value="range">Date Range</SelectItem></SelectContent></Select></div>
            {dateFilter === 'range' && <>
              <div><Label className="text-xs sm:text-sm">Start Date</Label><Input type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)} className="h-9 sm:h-10 text-xs sm:text-sm" /></div>
              <div><Label className="text-xs sm:text-sm">End Date</Label><Input type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)} className="h-9 sm:h-10 text-xs sm:text-sm" /></div>
            </>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs sm:text-sm">Select Users ({selectedUsers.length} selected)</Label>
              <div className="space-x-1 sm:space-x-2">
                <Button variant="outline" size="sm" className="h-7 text-xs sm:h-8 sm:text-sm" onClick={handleSelectAll}>Select All</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs sm:h-8 sm:text-sm" onClick={handleClearSelection}>Clear</Button>
              </div>
            </div>
            <Select onValueChange={(value) => handleUserSelection(value, !selectedUsers.includes(value))}>
              <SelectTrigger className="w-full h-9 sm:h-10 text-xs sm:text-sm">
                <SelectValue placeholder="Select users to monitor..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {filteredUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={selectedUsers.includes(user.id)} onChange={() => {}} className="h-4 w-4 rounded border-border" />
                      <span className="text-xs sm:text-sm">{user.full_name} ({user.username})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedUsers.length > 0 && (
              <div className="mt-2 p-2 bg-muted rounded">
                <div className="text-[10px] sm:text-xs text-muted-foreground mb-1">Selected users:</div>
                <div className="flex flex-wrap gap-1">
                  {selectedUsers.map(userId => {
                    const user = users.find(u => u.id === userId);
                    return user ? (
                      <div key={userId} className="flex items-center gap-1 bg-background px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs">
                        <span>{user.full_name}</span>
                        <button onClick={() => handleUserSelection(userId, false)} className="text-destructive hover:text-destructive/80">×</button>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end"><Button onClick={exportData} size="sm" className="flex items-center gap-2 h-8 sm:h-10 text-xs sm:text-sm"><Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />Export Data</Button></div>
        </CardContent>
      </Card>

      {/* Simplified Table */}
      <Card>
        <CardHeader className="p-3 sm:p-6"><CardTitle className="text-sm sm:text-lg">Live Attendance Data</CardTitle><CardDescription className="text-xs sm:text-sm">Click on an employee name to view full details</CardDescription></CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {isLoading ? <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs sm:text-sm">Employee</TableHead>
                  <TableHead className="text-xs sm:text-sm">Date</TableHead>
                  <TableHead className="text-xs sm:text-sm">Photo</TableHead>
                  <TableHead className="text-xs sm:text-sm">Check In</TableHead>
                  <TableHead className="text-xs sm:text-sm">Check Out</TableHead>
                  <TableHead className="text-xs sm:text-sm">Status</TableHead>
                  <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Face Match</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredData.map(r => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-muted/70" onClick={() => setDetailRecord(r)}>
                      <TableCell className="font-medium text-xs sm:text-sm py-2 sm:py-3">
                        <span className="text-primary hover:underline">{r.profiles?.full_name || 'Unknown'}</span>
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm py-2 sm:py-3">{format(new Date(r.date), 'MMM dd')}</TableCell>
                      <TableCell className="py-2 sm:py-3">
                        {r.signed_photo_url ? (
                          <img
                            src={r.signed_photo_url}
                            alt="Check-in"
                            className="h-8 w-8 rounded object-cover border"
                            loading="lazy"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : <span className="text-xs text-muted-foreground">--</span>}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm py-2 sm:py-3">
                        {r.check_in_time ? <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{format(new Date(r.check_in_time), 'HH:mm')}</div> : '--'}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm py-2 sm:py-3">
                        {r.check_out_time ? <div className="flex items-center gap-1"><Clock className="h-3 w-3 text-muted-foreground" />{format(new Date(r.check_out_time), 'HH:mm')}</div> : '--'}
                      </TableCell>
                      <TableCell className="py-2 sm:py-3">{getStatusBadge(r.status)}</TableCell>
                      <TableCell className="py-2 sm:py-3 hidden sm:table-cell">
                        <FaceMatchBadge confidence={r.face_match_confidence} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {!isLoading && filteredData.length === 0 && <div className="text-center py-6 sm:py-8 text-xs sm:text-sm text-muted-foreground">No attendance data found.</div>}
        </CardContent>
      </Card>

      {/* Employee Detail Panel */}
      <Sheet open={!!detailRecord} onOpenChange={(open) => !open && setDetailRecord(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {detailRecord && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="text-lg">{detailRecord.profiles?.full_name || 'Unknown'}</SheetTitle>
              </SheetHeader>

              <div className="space-y-5">
                {/* Photo */}
                {detailRecord.signed_photo_url && (
                  <div className="flex justify-center">
                    <img src={detailRecord.signed_photo_url} alt="Check-in photo" className="h-32 w-32 rounded-lg object-cover border shadow-sm" />
                  </div>
                )}

                {/* Status & Date */}
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">{format(new Date(detailRecord.date), 'EEEE, MMM dd, yyyy')}</div>
                  {getStatusBadge(detailRecord.status)}
                </div>

                {/* Time Details */}
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-green-600" /> First Check In</div>
                      <span className="text-sm font-medium">{detailRecord.check_in_time ? format(new Date(detailRecord.check_in_time), 'hh:mm a') : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-red-600" /> Last Check Out</div>
                      <span className="text-sm font-medium">{detailRecord.check_out_time ? format(new Date(detailRecord.check_out_time), 'hh:mm a') : '--'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-primary" /> Active Market Hours</div>
                      <span className="text-sm font-medium">{detailRecord.active_market_hours ? `${detailRecord.active_market_hours.toFixed(1)}h` : '--'}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Face Match Details */}
                <Card>
                  <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Face Verification</CardTitle></CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Check In Match</span>
                      <FaceMatchBadge confidence={detailRecord.face_match_confidence} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Check Out Match</span>
                      <FaceMatchBadge confidence={detailRecord.face_match_confidence_out} />
                    </div>
                  </CardContent>
                </Card>

                {/* Location */}
                {detailRecord.check_in_location && (
                  <Card>
                    <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Check In Location</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="text-sm">
                          {detailRecord.check_in_address || `${detailRecord.check_in_location.latitude?.toFixed(5)}, ${detailRecord.check_in_location.longitude?.toFixed(5)}`}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full text-xs"
                        onClick={() => window.open(`https://www.google.com/maps?q=${detailRecord.check_in_location.latitude},${detailRecord.check_in_location.longitude}`, '_blank')}
                      >
                        <MapPin className="h-3 w-3 mr-1" /> Open in Google Maps
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {detailRecord.check_out_location && (
                  <Card>
                    <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Check Out Location</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <div className="text-sm">
                          {detailRecord.check_out_address || `${detailRecord.check_out_location.latitude?.toFixed(5)}, ${detailRecord.check_out_location.longitude?.toFixed(5)}`}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full text-xs"
                        onClick={() => window.open(`https://www.google.com/maps?q=${detailRecord.check_out_location.latitude},${detailRecord.check_out_location.longitude}`, '_blank')}
                      >
                        <MapPin className="h-3 w-3 mr-1" /> Open in Google Maps
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default LiveAttendanceMonitoring;
