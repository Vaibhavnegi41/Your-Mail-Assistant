'use client';

import React, { useState, useEffect } from 'react';
import { Lock, AlertCircle, ArrowRight, Sparkles, Shield, Mail, Zap, RefreshCw } from 'lucide-react';

export interface AuthUserInfo {
  email: string;
  name: string;
  picture?: string;
  userId?: string;
}

export interface AuthScreenProps {
  onSignInSuccess: (authData: { token: string; userInfo: AuthUserInfo }) => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSignInSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Connecting to Google...');
  const [error, setError] = useState<string | null>(null);

  // Fallback to client ID configured in extension/env
  const googleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    '325231381568-gfroom11992oc6047bj3tt11msk3rhpq.apps.googleusercontent.com';

  const handleGoogleSignIn = () => {
    setError(null);
    setIsLoading(true);
    setLoadingMessage('Opening Google Sign-In...');

    // 1. Check if Google Identity Services script is loaded
    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
      // Try to dynamically load script if not yet ready
      const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => handleGoogleSignIn();
        script.onerror = () => {
          setIsLoading(false);
          setError('Could not load Google Identity Services. Check your internet connection.');
        };
        document.body.appendChild(script);
        return;
      }

      setIsLoading(false);
      setError('Google auth service is initializing. Please click "Continue with Google" again in a moment.');
      return;
    }

    try {
      // 2. Initialize Token Client for Google OAuth2
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: googleClientId,
        scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
        prompt: 'consent',
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('[WebAuth] Token error:', tokenResponse);
            setIsLoading(false);
            if (tokenResponse.error === 'popup_closed_by_user') {
              setError('Sign-in cancelled. You closed the Google popup.');
            } else if (tokenResponse.error === 'access_denied') {
              setError('Access denied. Please grant permissions to use the Email Assistant.');
            } else {
              setError(`Google Sign-In error: ${tokenResponse.error_description || tokenResponse.error}`);
            }
            return;
          }

          const accessToken = tokenResponse.access_token;
          if (!accessToken) {
            setIsLoading(false);
            setError('No access token received from Google.');
            return;
          }

          setLoadingMessage('Retrieving profile...');

          // 3. Fetch user info using the access token
          try {
            const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (profileRes.ok) {
              const data = await profileRes.json();
              const userInfo: AuthUserInfo = {
                email: data.email || '',
                name: data.name || data.given_name || (data.email ? data.email.split('@')[0] : 'User'),
                picture: data.picture || '',
                userId: data.sub || '',
              };
              onSignInSuccess({ token: accessToken, userInfo });
            } else {
              // Token is valid but userinfo endpoint had an issue; fallback to basic user
              onSignInSuccess({
                token: accessToken,
                userInfo: {
                  email: 'authenticated.user@gmail.com',
                  name: 'Google User',
                  picture: '',
                  userId: 'user',
                },
              });
            }
          } catch (fetchErr) {
            console.warn('[WebAuth] Userinfo fetch failed, proceeding with token:', fetchErr);
            onSignInSuccess({
              token: accessToken,
              userInfo: {
                email: 'authenticated.user@gmail.com',
                name: 'Google User',
                picture: '',
                userId: 'user',
              },
            });
          } finally {
            setIsLoading(false);
          }
        },
        error_callback: (err: any) => {
          console.error('[WebAuth] TokenClient initialization error:', err);
          setIsLoading(false);
          setError(
            err?.message ||
              'Google OAuth initialization failed. If this is localhost, ensure your Google Cloud Client ID allows http://localhost:3000.'
          );
        },
      });

      // 4. Request the access token (opens popup)
      tokenClient.requestAccessToken();
    } catch (e: any) {
      console.error('[WebAuth] Exception during sign in:', e);
      setIsLoading(false);
      setError(e?.message || 'Failed to start Google sign-in process.');
    }
  };

  // Demo / Dev mode login bypass
  const handleDevSignIn = () => {
    onSignInSuccess({
      token: 'dev-mock-google-token',
      userInfo: {
        email: 'developer@emailassistant.ai',
        name: 'Developer Workspace',
        picture: '',
        userId: 'dev-user-001',
      },
    });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#04060c] flex items-center justify-center p-4 select-none">
      {/* Background Canvas & Animated Glow Orbs */}
      <div className="auth-bg-canvas">
        <div className="auth-orb auth-orb-1" />
        <div className="auth-orb auth-orb-2" />
        <div className="auth-orb auth-orb-3" />
      </div>

      {/* Frosted Glassmorphism Card */}
      <div className="relative z-10 w-full max-w-[390px] bg-[#0d111c]/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8),0_0_40px_rgba(56,189,248,0.12),inset_0_1px_0_rgba(255,255,255,0.15)] flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
        {/* Pill Tag */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-400/25 text-[11px] font-semibold text-sky-400 tracking-wide mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_#38bdf8] animate-pulse" />
          AI-Powered Studio
        </div>

        {/* Glowing Brand Logo */}
        <div className="relative mb-4">
          <div className="absolute -inset-1.5 rounded-2xl bg-gradient-to-tr from-sky-400 via-indigo-500 to-purple-500 opacity-60 blur-md animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-white/20 flex items-center justify-center shadow-xl">
            <img
              src="/icons8-bot-48.png"
              alt="AI Email Assistant"
              width={40}
              height={40}
              className="object-contain drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
            />
          </div>
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-100 to-slate-400 tracking-tight mb-2">
          AI Email Assistant
        </h1>
        <p className="text-xs text-slate-400 leading-relaxed mb-5 max-w-[300px]">
          Generate, review & approve smart drafts directly in Gmail with Human-in-the-Loop AI.
        </p>

        {/* Feature Highlights Showcase */}
        <div className="w-full flex flex-col gap-2 mb-6 text-left">
          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all">
            <div className="w-7 h-7 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center text-xs shrink-0 font-bold">
              ⚡
            </div>
            <div className="text-[12px] text-slate-300 leading-snug">
              <strong className="text-white font-semibold">Context-Aware Synthesis</strong>
              <div className="text-[11px] text-slate-400">Adaptive tone, notes & document grounding</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all">
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center text-xs shrink-0 font-bold">
              🛡️
            </div>
            <div className="text-[12px] text-slate-300 leading-snug">
              <strong className="text-white font-semibold">Human-in-the-Loop Review</strong>
              <div className="text-[11px] text-slate-400">Nothing sends until you inspect & approve</div>
            </div>
          </div>

          <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-xs shrink-0 font-bold">
              📬
            </div>
            <div className="text-[12px] text-slate-300 leading-snug">
              <strong className="text-white font-semibold">Native Gmail Integration</strong>
              <div className="text-[11px] text-slate-400">1-click dispatch directly from Gmail tab</div>
            </div>
          </div>
        </div>

        {/* Error message banner */}
        {error && (
          <div className="w-full mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2 text-left animate-in fade-in">
            <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-400" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {/* Google Sign-In Action Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 py-3 px-5 rounded-xl bg-white text-slate-900 font-bold text-sm tracking-tight shadow-[0_4px_16px_rgba(0,0,0,0.4),0_0_24px_rgba(255,255,255,0.2)] hover:bg-slate-100 hover:shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_32px_rgba(255,255,255,0.35)] hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-75 disabled:cursor-not-allowed transition-all cursor-pointer"
        >
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-800">
              <RefreshCw size={16} className="animate-spin text-sky-600" />
              <span>{loadingMessage}</span>
            </div>
          ) : (
            <>
              {/* Google Official G Icon */}
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        {/* Security badge note */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-4">
          <Lock size={12} className="text-slate-500" />
          <span>Secure Google OAuth 2.0 authentication</span>
        </div>

        {/* Dev / Demo sign-in link */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] w-full text-center">
          <button
            type="button"
            onClick={handleDevSignIn}
            className="text-[11px] text-slate-500 hover:text-sky-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <span>Explore Demo / Dev Workspace</span>
            <ArrowRight size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};
