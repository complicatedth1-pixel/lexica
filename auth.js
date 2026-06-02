// auth.js — Supabase client, sign-in/out, Google OAuth, user menu
// Owns: sb (Supabase), currentUser
// Calls: onUserLoggedIn(user) after successful login

'use strict';

const SUPABASE_URL = 'https://ckrtzfyqkcgnsbueetqh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrcnR6Znlxa2NnbnNidWVldHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDk4NjEsImV4cCI6MjA5Mzk4NTg2MX0.S7bRBw6jJtTHxiTgFxL_45kIeV1Q4EotKd2MFviOMac';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
});

let currentUser = null;

// FIX: Guard against double-fire of onUserLoggedIn.
// onAuthStateChange fires on page load AND checkSessionOnLoad also fires —
// both call onUserLoggedIn → loadLibraryFromSupabase() twice, causing the
// second fetch to overwrite library state while first-load saves are in flight.
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
  el.textContent = msg;
  el.style.display = 'block';
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
  _loginHandled = false; // reset so next login works
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
  // FIX: Only handle login once per page load.
  // Without this, both checkSessionOnLoad() and onAuthStateChange() fire on
  // every page load, calling loadLibraryFromSupabase() twice and creating a
  // race where the second fetch overwrites in-flight save data.
  if (_loginHandled && currentUser?.id === user.id) return;
  _loginHandled = true;

  currentUser = user;

  // FIX: Expose currentUser globally so stopwatch.js beforeunload beacon
  // can access it. Previously it was only a local var in auth.js scope.
  window.currentUser = user;

  // FIX: Expose the session token so beforeunload sendBeacon can include
  // the Authorization header that Supabase REST requires.
  // Without this, the beacon fires with no auth headers → 401 → silent loss.
  sb.auth.getSession().then(({ data }) => {
    window._supabaseAccessToken = data?.session?.access_token || null;
  });

  document.getElementById('authScreen').classList.add('auth-hidden');
  document.getElementById('userMenu').classList.add('user-visible');
  const initial = (user.user_metadata?.full_name || user.email || '?')[0].toUpperCase();
  document.getElementById('userAvatarBtn').textContent = initial;
  document.getElementById('userEmailDisplay').textContent = user.email || '';
  loadLibraryFromSupabase(); // defined in library.js
  if (window.promptSettings) window.promptSettings.init();
}

sb.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    // FIX: Keep access token fresh on token refresh events so beacon always
    // has a valid JWT even after a long session.
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

(async function checkSessionOnLoad() {
  const { data } = await sb.auth.getSession();
  if (data?.session?.user) {
    window._supabaseAccessToken = data.session.access_token || null;
    onUserLoggedIn(data.session.user);
  }
})();

// Expose to HTML onclick attributes
window.showAuthTab = showAuthTab;
window.signInWithGoogle = signInWithGoogle;
window.submitAuth = submitAuth;
window.signOut = signOut;
window.toggleUserDropdown = toggleUserDropdown;
window._supabase = sb;