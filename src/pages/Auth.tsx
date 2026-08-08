import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

import { Sparkles, Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const REMEMBERED_EMAIL_KEY = "remembered-email";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState(
    () => localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ""
  );
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const rawNext = params.get("next") ?? "";
  const nextPath = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  useEffect(() => {
    if (!loading && user) {
      navigate(nextPath);
    }
  }, [user, loading, navigate, nextPath]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const validation = authSchema.safeParse({ email, password });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    const { error } = isLogin
      ? await signIn(email, password)
      : await signUp(email, password, nextPath);

    if (error) {
      if (error.message.includes("User already registered")) {
        toast.error("An account with this email already exists. Please sign in.");
      } else if (error.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password.");
      } else {
        toast.error(error.message);
      }
    } else {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email);

      if (!isLogin) {
        toast.success("Account created successfully!");
      }
    }


    setIsLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
            <Sparkles className="w-8 h-8 text-primary animate-pulse-glow" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {isLogin ? "Welcome back" : "Create account"}
          </h1>
          <p className="text-muted-foreground">
            {isLogin
              ? "Sign in to continue your conversations"
              : "Sign up to save your chat history"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass p-6 rounded-2xl space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-background/50 border-border/50 focus:border-primary"
                required
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            You'll stay signed in on this device.
          </p>



          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isLogin ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Auth;
