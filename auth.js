// auth.js — Supabase client, sign-in/out, Google OAuth, user menu
'use strict';

const SUPABASE_URL = 'https://ckrtzfyqkcgnsbueetqh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrcnR6Znlxa2NnbnNidWVldHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDk4NjEsImV4cCI6MjA5Mzk4NTg2MX0.S7bRBw6jJtTHxiTgFxL_45kIeV1Q4EotKd2MFviOMac';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});

let currentUser = null;
let _loginHandled = false;

let _authTab = 'login';

function showAuthTab(tab) {
  _authTab = tab;
  ['login', 'register'].forEach(t => {
    const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    el.style.background = tab === t ? 'rgba(212,135,42,0.15)' : 'transparent';
    el.style.color = tab === t ? '#d4872a' : '#8a7a5a';
    el.style.borderColor = tab === t ? 'rgba(212,135,42,0.5)' : 'rgba(255,255,255,0.08)';
  });
  document.getElementById('authSubmitBtn').textContent = tab === 'login' ? 'Sign In' : 'Create Account';
}

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg; el.style.display = 'block';
}

async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) showAuthError(error.message);
}

async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  if (!email || !password) { showAuthError('Please enter email and password'); return; }
  document.getElementById('authLoading').style.display = 'block';
  document.getElementById('authSubmitBtn').disabled = true;
  const result = _authTab === 'login'
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });
  document.getElementById('authLoading').style.display = 'none';
  document.getElementById('authSubmitBtn').disabled = false;
  if (result.error) { showAuthError(result.error.message); return; }
  if (_authTab === 'register' && !result.data?.session)
    showAuthError('Check your email to confirm, then sign in.');
}

async function signOut() {
  _loginHandled = false;
  await sb.auth.signOut();
  location.reload();
}

function toggleUserDropdown() {
  const d = document.getElementById('userDropdown');
  d.style.display = d.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', e => {
  if (!document.getElementById('userAvatarBtn')?.contains(e.target)) {
    const d = document.getElementById('userDropdown');
    if (d) d.style.display = 'none';
  }
});

function onUserLoggedIn(user) {
  if (_loginHandled && currentUser?.id === user.id) return;
  _loginHandled = true;
  currentUser = user;
  window.currentUser = user;

  // Keep access token fresh for beforeunload beacon
  sb.auth.getSession().then(({ data }) => {
    window._supabaseAccessToken = data?.session?.access_token || null;
  });

  document.getElementById('authScreen').classList.add('auth-hidden');
  document.getElementById('userMenu').classList.add('user-visible');
  const initial = (user.user_metadata?.full_name || user.email || '?')[0].toUpperCase();
  document.getElementById('userAvatarBtn').textContent = initial;
  document.getElementById('userEmailDisplay').textContent = user.email || '';

  // FIX: auth.js loads before library.js so loadLibraryFromSupabase is not
  // defined yet when onAuthStateChange fires synchronously on page load.
  // Defer with setTimeout(0) to let all scripts finish parsing first.
  setTimeout(() => {
    if (typeof loadLibraryFromSupabase === 'function') {
      loadLibraryFromSupabase();
    } else {
      console.error('[auth] loadLibraryFromSupabase still not defined after defer');
    }
    if (window.promptSettings) window.promptSettings.init();
  }, 0);
}

sb.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    window._supabaseAccessToken = session.access_token || null;
    onUserLoggedIn(session.user);
  } else if (event === 'SIGNED_OUT' || !session) {
    _loginHandled = false;
    currentUser = null;
    window.currentUser = null;
    window._supabaseAccessToken = null;
    document.getElementById('authScreen').classList.remove('auth-hidden');
    document.getElementById('userMenu').classList.remove('user-visible');
  }
});

// checkSessionOnLoad runs after DOMContentLoaded so all scripts are parsed —
// no defer needed here, but kept consistent with the onAuthStateChange path.
(async function checkSessionOnLoad() {
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    window._supabaseAccessToken = data.session.access_token || null;
    onUserLoggedIn(data.session.user);
  }
})();

// Expose
window.showAuthTab = showAuthTab;
window.signInWithGoogle = signInWithGoogle;
window.submitAuth = submitAuth;
window.signOut = signOut;
window.toggleUserDropdown = toggleUserDropdown;
window._supabase = sb;