import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
    });
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: userData, error: rpcError } = await supabase.rpc("ensure_current_user", {
        _email: email,
      });

      if (rpcError) {
        console.error("ensure_current_user error:", rpcError);
      }

      const displayName = userData?.[0]?.full_name || userData?.[0]?.username || email;
      toast.success(`Welcome back, ${displayName}!`);
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, hsl(200 80% 82%) 0%, hsl(210 85% 75%) 50%, hsl(200 75% 85%) 100%)",
      }}
    >
      <Card className="w-full max-w-md shadow-hero border-0 rounded-2xl overflow-hidden">
        <CardContent className="p-8 pt-10 pb-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-card shadow-elevated flex items-center justify-center mb-4">
              <Building2 className="h-8 w-8 text-foreground" />
            </div>
            <h1 className="text-xl font-bold text-primary">Bharath Builders</h1>
            <p className="text-xs text-muted-foreground tracking-wide uppercase mt-0.5">
              Field Force Management
            </p>
          </div>

          {/* Welcome text */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-foreground">Welcome</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                Email Address
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 rounded-xl border-border bg-muted/40 px-4 text-sm placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                Password
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 rounded-xl border-border bg-muted/40 px-4 pr-12 text-sm placeholder:text-muted-foreground/60"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-xl bg-foreground text-background font-semibold text-sm hover:bg-foreground/90 transition-colors"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign In as User"}
            </Button>

            <div className="text-center space-y-2 pt-1">
              <button
                type="button"
                className="text-sm font-bold text-foreground hover:underline"
              >
                Admin Sign In
              </button>
              <p>
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Forgot your password?
                </button>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
