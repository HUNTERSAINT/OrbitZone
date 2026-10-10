import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowRight, Camera, Check, ChevronDown, CircleAlert,
  Heart, ImagePlus, KeyRound, LoaderCircle, LogOut, MapPin, MessageCircle, ShieldCheck, Trash2, UserRound,
  Waves, X,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey, getGetMyProfileQueryKey, getHealthCheckQueryKey,
  useDeleteMyAccount, useGetCurrentUser, useGetMyProfile, useHealthCheck, useLoginAccount,
  useLogoutAccount, useRegisterAccount, useRequestUploadUrl, useSubmitVerificationSelfie,
  useUpdateMyProfile,
} from '@workspace/api-client-react';
import type { ProfileUpdate, RegistrationInput, UploadUrlRequestContentType } from '@workspace/api-client-react';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { profilePhotoUrl } from '@/lib/profile-photo-url';
import NotFound from '@/pages/not-found';
import DiscoverPage from '@/pages/discover';
import AdminPage from '@/pages/admin';
import { ChatPage, FullProfilePage, MatchesPage, PlanPage, SearchPage } from '@/pages/community';
import './index.css';

const queryClient = new QueryClient();

function RiverHeart() {
  return <span className="brand-mark" aria-label="Orbit Zone">
    <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <path d="M5 9c5 0 6.1 7 11.2 7 3.8 0 5.4-4.3 8.3-6.1 2.1-1.3 4.4-1.2 6.5.1" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
      <path d="M4 17.8c4.1-1.6 7.5-1.3 10.2 1.1 2.6 2.3 4.1 7.6 8.3 7.6 4.4 0 5.9-6.9 9.5-9.2" stroke="white" strokeWidth="2.8" strokeLinecap="round"/>
      <path d="M18 14.8c1.8-4.5 7.1-4.7 9.3-1.5 2.7 3.8-.5 8-9.3 14.2-8.7-6.2-12-10.4-9.3-14.2 2.2-3.2 7.5-3 9.3 1.5Z" stroke="white" strokeWidth="1.3" opacity=".85"/>
    </svg>
  </span>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3">
    <RiverHeart />
    <div className="leading-tight">
      <div className="font-display text-[19px] font-extrabold tracking-[-.055em] text-[#202b42]">Orbit Zone</div>
      {!compact && <div className="mt-0.5 text-[10px] font-semibold tracking-[.13em] text-[#9a8490]">WHERE LOKOJA MEETS.</div>}
    </div>
  </div>;
}

function Button({ children, onClick, type = 'button', disabled, variant = 'primary', className = '', testId }: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean;
  variant?: 'primary' | 'quiet' | 'danger' | 'outline'; className?: string; testId?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${className}`} data-testid={testId ?? `button-${variant}`}>
    {children}
  </button>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field-wrap"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const session = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request: { credentials: 'include' } });
  const policyOrAuth = ['/', '/login', '/register', '/terms', '/privacy'].includes(location);
  const showSignedInNav = !!session.data && !policyOrAuth;
  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><Link href="/" className="brand-link" data-testid="link-home"><Brand /></Link>{showSignedInNav && <nav className="topbar-nav" aria-label="Main navigation"><Link href="/discover" className={location === '/discover' ? 'discover-nav-active' : ''} data-testid="link-discover">Discover</Link>{session.data?.gender === 'male' && <Link href="/search" data-testid="link-search">Search</Link>}<Link href="/matches" data-testid="link-matches">Matches</Link><Link href="/profile" data-testid="link-profile">Profile</Link><Link href="/plan" data-testid="link-plan">Plan</Link>{session.data?.isAdmin && <Link href="/admin">Admin</Link>}<div className="topbar-loc"><MapPin size={14} /> Lokoja, Kogi</div></nav>}</div></header>
    <main>{children}</main>
    {showSignedInNav && <nav className="nav-mobile" aria-label="Main navigation">
      <Link href="/discover" className={location === '/discover' ? 'active' : ''}><Heart size={17} />Discover</Link>
      {session.data?.gender === 'male' && <Link href="/search" className={location === '/search' ? 'active' : ''}><MapPin size={17} />Search</Link>}
      <Link href="/matches" className={location.startsWith('/matches') || location.startsWith('/chat/') ? 'active' : ''}><Activity size={17} />Matches</Link>
      <Link href="/profile" className={location === '/profile' ? 'active' : ''}><UserRound size={17} />Profile</Link>
    </nav>}
    <footer className="site-footer"><span>© Orbit Zone, Lokoja, Nigeria</span><span className="footer-links"><Link href="/terms" data-testid="link-terms-footer">Terms</Link><Link href="/privacy" data-testid="link-privacy-footer">Privacy</Link><Link href="/contact" data-testid="link-contact-footer">Contact</Link></span></footer>
    <div className="route-key" aria-hidden="true">{location}</div>
  </div>;
}

function AuthPage() {
  const [currentPath, navigate] = useLocation();
  const [mode, setMode] = useState<'register' | 'login'>(currentPath === '/login' ? 'login' : 'register');
  const [error, setError] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [area, setArea] = useState('');
  const [bio, setBio] = useState('');
  const [wantsRelationship, setWantsRelationship] = useState(false);
  const [wantsFriendsWithBenefits, setWantsFriendsWithBenefits] = useState(false);
  const [wantsHookup, setWantsHookup] = useState(false);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const client = useQueryClient();
  const register = useRegisterAccount({ request: { credentials: 'include' } });
  const login = useLoginAccount({ request: { credentials: 'include' } });
  const requestUpload = useRequestUploadUrl({ request: { credentials: 'include' } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false }, request: { credentials: 'include' } });
  const busy = register.isPending || login.isPending || uploading;
  const errText = (value: unknown) => value instanceof Error ? value.message : 'Something went wrong. Please try again.';

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError('');
    if (photoPaths.length + files.length > 5) { setError('Choose up to five profile photos.'); e.target.value = ''; return; }
    setUploading(true);
    try {
      const paths: string[] = [];
      const previews: string[] = [];
      for (const source of files) {
        const file = await optimizeImage(source);
        const contentType = file.type as UploadUrlRequestContentType;
        const response = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType } });
        const upload = await fetch(response.uploadURL, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file });
        if (!upload.ok) throw new Error('Photo upload did not complete. Please try again.');
        paths.push(response.objectPath);
        previews.push(URL.createObjectURL(file));
      }
      setPhotoPaths((current) => [...current, ...paths]);
      setPhotoPreviews((current) => [...current, ...previews]);
    } catch (e) { setError(errText(e)); }
    finally { setUploading(false); e.target.value = ''; }
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setError('');
    if (mode === 'login') {
      try {
        await login.mutateAsync({ data: { identifier: identifier.trim(), password } });
        await client.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        navigate('/discover');
      } catch (e) { setError(errText(e)); }
      return;
    }
    if (photoPaths.length < 1) { setError('Add at least one profile photo to continue.'); return; }
    if (!terms || !privacy) { setError('Please accept both the Terms and Privacy Notice to continue.'); return; }
    try {
      const payload: RegistrationInput = {
        identifier: identifier.trim(), password, fullName: fullName.trim(), gender,
        dateOfBirth, area: area.trim(), bio: bio.trim(), photoPaths,
        wantsRelationship, wantsFriendsWithBenefits, wantsHookup,
        acceptsTerms: true, acceptsPrivacy: true,
      };
      await register.mutateAsync({ data: payload });
      await client.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      navigate('/discover');
    } catch (e) { setError(errText(e)); }
  }

  function removePhoto(index: number) {
    setPhotoPaths((old) => old.filter((_, i) => i !== index));
    setPhotoPreviews((old) => { const removed = old[index]; if (removed) URL.revokeObjectURL(removed); return old.filter((_, i) => i !== index); });
  }

  return <AppShell>
    <section className="auth-layout">
      <div className="intro-panel fade-in">
        <div className="eyebrow"><span className="eyebrow-line" /> A new way to meet, right here</div>
        <h1 className="hero-title">Two rivers.<br /><span>One beginning.</span></h1>
        <p className="hero-copy">Orbit Zone is a friendly place for adults in Lokoja to show up as themselves and start a genuine connection.</p>
        <div className="river-art" aria-hidden="true">
          <svg viewBox="0 0 480 185" fill="none">
            <path d="M-10 70C75 70 73 132 154 132c53 0 66-72 119-72 30 0 50 20 69 44 24 30 45 60 95 60h53" stroke="#e4a1b1" strokeWidth="18" strokeLinecap="round" opacity=".42"/>
            <path d="M-20 109c59 0 75-59 128-59 55 0 68 80 125 80 51 0 61-72 111-72 51 0 57 77 133 77" stroke="#e85278" strokeWidth="9" strokeLinecap="round"/>
            <path d="M-20 143c79 0 87-43 138-43s63 43 107 43c49 0 69-52 108-52 57 0 67 63 136 63" stroke="#e995a8" strokeWidth="6" strokeLinecap="round" opacity=".8"/>
            <path d="M321 53c11-24 39-25 50-8 14 21-2 44-50 76-47-32-64-55-50-76 11-17 39-16 50 8Z" stroke="#ca3e61" strokeWidth="4" fill="#f6dce2"/>
          </svg>
          <div className="art-caption">Where Lokoja meets.</div>
        </div>
        <div className="trust-note"><ShieldCheck size={17} /><span>Adults only. Your profile is yours to shape.</span></div>
      </div>
      <div className="auth-card soft-shadow fade-in">
        <div className="auth-card-heading">
          <div className="auth-heading-icon"><Heart size={19} /></div>
          <div><h2>{mode === 'register' ? 'Start with you' : 'Good to see you'}</h2><p>{mode === 'register' ? 'Create your account and profile.' : 'Sign in to pick up where you left off.'}</p></div>
        </div>
        <div className="auth-tabs" role="tablist">
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); navigate('/register'); }} data-testid="tab-register">Create account</button>
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); navigate('/login'); }} data-testid="tab-login">Log in</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <Field label="Email or Nigerian phone number">
            <input required minLength={5} maxLength={254} autoComplete="username" placeholder="you@example.com or 080…" value={identifier} onChange={(e) => setIdentifier(e.target.value)} data-testid="input-identifier" />
          </Field>
          <Field label="Password" hint={mode === 'register' ? 'Use at least 10 characters.' : undefined}>
            <input required minLength={mode === 'register' ? 10 : 1} maxLength={128} type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-password" />
          </Field>
          {mode === 'register' && <>
            <div className="form-divider"><span>Make it yours</span></div>
            <Field label="Your full name"><input required minLength={2} maxLength={80} placeholder="How should we call you?" value={fullName} onChange={(e) => setFullName(e.target.value)} data-testid="input-full-name" /></Field>
            <div className="two-fields">
              <Field label="Gender"><span className="select-shell"><select value={gender} onChange={(e) => setGender(e.target.value as 'male' | 'female')} data-testid="select-gender"><option value="female">Woman</option><option value="male">Man</option></select><ChevronDown size={16} /></span></Field>
              <Field label="Date of birth"><input required type="date" max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().slice(0, 10)} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} data-testid="input-date-of-birth" /></Field>
            </div>
            <Field label="Your area in Lokoja"><span className="select-shell"><select required value={area} onChange={(e) => setArea(e.target.value)} data-testid="select-area"><option value="">Choose your area</option>{['Adankolo','Felele','Ganaja','Lokongoma','Old Market','Phase II','Crusher','Other Lokoja area'].map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={16} /></span></Field>
            <Field label="A little about you" hint={`${bio.length}/240`}>
              <textarea rows={3} maxLength={240} placeholder="What would you like someone local to know?" value={bio} onChange={(e) => setBio(e.target.value)} data-testid="input-bio" />
            </Field>
            <div className="field-wrap"><span className="field-label">What are you open to?</span>
              <label className="check-row"><input type="checkbox" checked={wantsRelationship} onChange={(e) => setWantsRelationship(e.target.checked)} /><span>A relationship</span></label>
              <label className="check-row"><input type="checkbox" checked={wantsFriendsWithBenefits} onChange={(e) => setWantsFriendsWithBenefits(e.target.checked)} /><span>Friends with benefits</span></label>
              <label className="check-row"><input type="checkbox" checked={wantsHookup} onChange={(e) => setWantsHookup(e.target.checked)} /><span>Hookup</span></label>
              <span className="field-hint">Choose only what feels right. You can keep your intentions private until you’re ready.</span>
            </div>
            <div className="photo-label-row"><span className="field-label">Profile photos <b className="required-star">*</b></span><span className="photo-count">{photoPaths.length}/5</span></div>
            <div className="photo-picker-row">
              {photoPreviews.map((src, i) => <div className="photo-thumb" key={`${src}-${i}`}><img src={src} alt={`Selected profile photo ${i + 1}`} loading="lazy" /><button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(i)} data-testid={`remove-photo-${i}`}><X size={14} /></button></div>)}
              {photoPaths.length < 5 && <label className={`photo-add ${uploading ? 'disabled' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={uploading} onChange={onPhotos} data-testid="input-profile-photos" /><ImagePlus size={21} /><span>{uploading ? 'Adding…' : 'Add photos'}</span></label>}
            </div>
            <p className="field-hint photo-hint">1–5 clear photos. Images are compressed before secure upload to save mobile data.</p>
            <label className="check-row"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} data-testid="checkbox-terms" /><span>I accept the <Link href="/terms" data-testid="link-terms-registration">Terms of Service</Link>.</span></label>
            <label className="check-row"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} data-testid="checkbox-privacy" /><span>I have read the <Link href="/privacy" data-testid="link-privacy-registration">Privacy Notice</Link>.</span></label>
          </>}
          {error && <div className="inline-error" role="alert" data-testid="status-auth-error"><CircleAlert size={16} />{error}</div>}
          <Button type="submit" disabled={busy} className="auth-submit" testId="button-submit-auth">{busy ? <><LoaderCircle size={17} className="spin" /> {uploading ? 'Uploading photos…' : 'Please wait…'}</> : <>{mode === 'register' ? 'Create my account' : 'Log in'} <ArrowRight size={17} /></>}</Button>
          <p className="fine-print"><ShieldCheck size={14} /> We’ll never ask you to pay to access dating or sexual services.</p>
        </form>
        <div className={`service-status ${health.isError ? 'offline' : ''}`} data-testid="status-service">
          <span className="status-dot" />{health.isLoading ? 'Checking service…' : health.isError ? 'Service connection unavailable' : 'Orbit Zone is ready'}
          {health.isError && <button type="button" onClick={() => void health.refetch()} data-testid="button-retry-health">Retry</button>}
        </div>
      </div>
    </section>
  </AppShell>;
}

function LandingPage() {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request: { credentials: 'include' } });
  return <AppShell>
    <section className="landing-page">
      <div className="landing-hero">
        <div className="landing-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> Lokoja, meet closer</div>
          <h1>Where Lokoja<br/><span>meets.</span></h1>
          <p>A more thoughtful way to meet people around your corner of the city. Start with a profile, find a mutual hello, and let conversation lead.</p>
          <div className="landing-actions"><Link href={current.data ? '/discover' : '/register'} className="btn btn-primary">{current.data ? 'Go to Discover' : 'Join Orbit Zone'} <ArrowRight size={17}/></Link><Link href="/login" className="btn btn-outline">I have an account</Link></div>
          <div className="landing-proof"><ShieldCheck size={17}/> Adults 18+ · Made for Lokoja residents</div>
        </div>
        <div className="landing-art" aria-label="Flowing river and heart illustration">
          <div className="landing-art-orbit orbit-one"/><div className="landing-art-orbit orbit-two"/>
          <div className="landing-heart"><RiverHeart/></div>
          <span className="art-note note-top">A good hello<br/>starts nearby</span><span className="art-note note-bottom">Kogi State<br/>Nigeria</span>
          <svg viewBox="0 0 560 420" aria-hidden="true"><path d="M-30 250c128-3 105-125 227-123 96 2 101 149 208 148 71-1 87-63 186-65" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="68" strokeLinecap="round"/><path d="M-30 250c128-3 105-125 227-123 96 2 101 149 208 148 71-1 87-63 186-65" fill="none" stroke="rgba(255,255,255,.83)" strokeWidth="3" strokeLinecap="round"/><path d="M-20 310c119 2 130-74 225-75s115 80 210 80 113-48 184-49" fill="none" stroke="rgba(255,255,255,.54)" strokeWidth="3" strokeLinecap="round"/></svg>
        </div>
      </div>
      <div className="landing-feature-head"><div className="eyebrow"><span className="eyebrow-line"/> Three steps. No rush.</div><h2>Meet on your own terms.</h2></div>
      <div className="landing-steps">
        <article><span>01</span><Heart size={21}/><h3>Swipe</h3><p>See people who live around Lokoja. Read a little, then choose what feels right.</p></article>
        <article><span>02</span><Check size={21}/><h3>Match</h3><p>A mutual like makes the first introduction. Your pace stays yours.</p></article>
        <article><span>03</span><MessageCircle size={21}/><h3>Chat</h3><p>Start a conversation in the app and see where a kind hello can go.</p></article>
      </div>
      <div className="landing-safety"><ShieldCheck size={22}/><div><strong>Adults only. Connection first.</strong><p>Orbit Zone is for people 18 and over. Keep early conversations in the app, meet in public, and trust your instincts.</p></div><Link href="/terms">Our safety promise <ArrowRight size={15}/></Link></div>
    </section>
  </AppShell>;
}

async function optimizeImage(source: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type)) throw new Error('Use a JPEG, PNG, or WebP image.');
  if (source.size > 5 * 1024 * 1024) throw new Error('Each photo must be 5 MB or smaller.');
  const bitmap = await createImageBitmap(source);
  const max = 1500;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This photo could not be prepared. Please try another.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('This photo could not be prepared.')), 'image/jpeg', .78));
  return new File([blob], source.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

function PolicyLayout({ eyebrow, title, updated, children }: { eyebrow: string; title: string; updated: string; children: ReactNode }) {
  return <AppShell>
    <article className="policy-page fade-in" data-testid="page-policy">
      <div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div>
      <h1 className="policy-title" data-testid="text-policy-title">{title}</h1>
      <p className="policy-updated">{updated}</p>
      <div className="policy-content">{children}</div>
      <div className="policy-return"><Link href="/" className="btn btn-primary" data-testid="link-policy-register">Back to Orbit Zone <ArrowRight size={16} /></Link></div>
    </article>
  </AppShell>;
}

function TermsPage() {
  return <PolicyLayout eyebrow="A clear place to begin" title="Terms of Service" updated="For Orbit Zone members in Lokoja, Nigeria">
    <p className="policy-lead">Orbit Zone is a local dating service for adults seeking genuine, consensual connections. By creating an account, you agree to these terms.</p>
    <section><h2>Adults only</h2><p>You must be at least 18 years old to use Orbit Zone. We may request additional information or suspend an account if we cannot confirm that a member is an adult.</p></section>
    <section><h2>Respect and consent</h2><p>Be honest about who you are, use your own photos, and treat other members with respect. Consent must be freely given, specific, and ongoing. Harassment, threats, impersonation, coercion, and sharing another person’s private information or images without permission are not allowed.</p><p>Orbit Zone is for dating and social connection. It is not a place to arrange or sell sexual services. Any feature-access payments, if offered, pay only for access to app features; they are not payment for dates, intimacy, or sexual services.</p></section>
    <section><h2>Your profile and verification</h2><p>You are responsible for the information and photos you submit. Profile photos should represent you and should not expose someone else’s private information. A verification selfie is reviewed manually to help confirm account authenticity; submitting one does not guarantee verification.</p></section>
    <section><h2>Safety and account access</h2><p>Keep your password private and contact us if you suspect someone has accessed your account. Use your own judgment when meeting someone. Meet in a public place, tell someone you trust, and do not share financial or sensitive information with a new contact.</p><p>We may restrict or remove accounts that breach these terms or put members at risk. You can request deletion of your account from your profile.</p></section>
    <section><h2>Service availability</h2><p>We work to keep Orbit Zone available, but access may occasionally be interrupted for maintenance, security, or reasons outside our control. We may update these terms as the service changes; material updates will be reflected here.</p></section>
    <p className="policy-footnote">These terms are provided to explain how the service works and do not replace independent legal advice.</p>
  </PolicyLayout>;
}

function PrivacyPage() {
  return <PolicyLayout eyebrow="Your information, handled with care" title="Privacy Notice" updated="How Orbit Zone handles member information">
    <p className="policy-lead">This notice describes how Orbit Zone collects and uses information when adults in Lokoja create and manage an account.</p>
    <section><h2>Information you provide</h2><p>We collect your email address or Nigerian phone number, password credentials, name, gender, date of birth, area in Lokoja, profile bio, and profile photos. If you choose verification, we also receive the selfie and storage path you submit for manual review.</p></section>
    <section><h2>Why we use it</h2><p>We use account and profile information to create your account, provide profile editing and verification, protect the service, and respond to support requests. A verification selfie is used for identity and authenticity review, not for public display or dating recommendations.</p></section>
    <section><h2>Storage and sharing</h2><p>Your account information and photos are stored so the service can work. We do not sell personal information. Access is limited to what is needed to operate, secure, and support Orbit Zone, or to meet a legal obligation. We may use trusted service providers to host the app or store uploads, under appropriate safeguards.</p></section>
    <section><h2>Your choices and rights</h2><p>You may update your profile, choose whether to submit a verification selfie, or request account deletion from your profile. Depending on applicable law, you may also have rights to access, correct, object to, or request deletion of your personal data. Contact us to make a privacy request.</p></section>
    <section><h2>Nigeria Data Protection Act</h2><p>We aim to handle personal data in accordance with the Nigeria Data Protection Act 2023 and applicable data-protection requirements. We take reasonable steps to protect information, retain it only as needed for the purposes described or required by law, and address requests about your data.</p></section>
    <section><h2>Contact about privacy</h2><p>For questions or requests relating to your personal information, use the <Link href="/contact" data-testid="link-privacy-contact">Contact page</Link>. We may need to verify your account before acting on a request.</p></section>
    <p className="policy-footnote">This notice may be updated as Orbit Zone develops. The latest version will be available on this page.</p>
  </PolicyLayout>;
}

function ContactPage() {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  function submitContact(e: FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Orbit Zone support${name.trim() ? ` — ${name.trim()}` : ''}`);
    const body = encodeURIComponent(message.trim());
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setNotice('Your email app should open with your message. Add the Orbit Zone support address before sending.');
  }
  return <AppShell>
    <section className="contact-page fade-in">
      <div className="eyebrow"><span className="eyebrow-line" /> A real person, when you need one</div>
      <h1 className="policy-title">Get in touch.</h1>
      <p className="contact-intro">Questions about your account, verification, or privacy? Send a note to the Orbit Zone team.</p>
      <form className="contact-card soft-shadow" onSubmit={submitContact}>
        <Field label="Your name"><input maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" data-testid="contact-name" /></Field>
        <Field label="What can we help with?"><textarea required minLength={5} maxLength={2000} rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us a little about your question." data-testid="contact-message" /></Field>
        {notice && <div className="inline-success" role="status" data-testid="status-contact">{notice}</div>}
      <Button type="submit" className="contact-submit" testId="button-prepare-contact">Prepare an email <ArrowRight size={16} /></Button>
        <p className="field-hint">This opens your device’s email app with a prepared message. Do not include passwords or sensitive identity documents.</p>
      </form>
      <p className="contact-safety"><strong>Never send money to someone you match with.</strong> For immediate danger, contact local emergency services or someone you trust.</p>
    </section>
  </AppShell>;
}

function ProfilePage() {
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request: { credentials: 'include' } });
  const profile = useGetMyProfile({ query: { queryKey: getGetMyProfileQueryKey(), enabled: !!current.data, retry: false }, request: { credentials: 'include' } });
  const logout = useLogoutAccount({ request: { credentials: 'include' } });
  const removeAccount = useDeleteMyAccount({ request: { credentials: 'include' } });
  const update = useUpdateMyProfile({ request: { credentials: 'include' } });
  const submitSelfie = useSubmitVerificationSelfie({ request: { credentials: 'include' } });
  const requestUpload = useRequestUploadUrl({ request: { credentials: 'include' } });
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('female');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [area, setArea] = useState('');
  const [bio, setBio] = useState('');
  const [wantsRelationship, setWantsRelationship] = useState(false);
  const [wantsFriendsWithBenefits, setWantsFriendsWithBenefits] = useState(false);
  const [wantsHookup, setWantsHookup] = useState(false);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [selfiePreview, setSelfiePreview] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const user = profile.data ?? current.data;
  const initialized = profile.data ?? current.data;
  // Set profile fields once per newly loaded user; saved changes are kept local until explicitly submitted.
  const [loadedId, setLoadedId] = useState('');
  useEffect(() => {
    if (!initialized || loadedId === initialized.id) return;
    setLoadedId(initialized.id);
    setFullName(initialized.fullName);
    setGender(initialized.gender);
    setDateOfBirth(initialized.dateOfBirth?.slice(0, 10) ?? '');
    setArea(initialized.area);
    setBio(initialized.bio);
    setWantsRelationship(initialized.wantsRelationship ?? false);
    setWantsFriendsWithBenefits(initialized.wantsFriendsWithBenefits ?? false);
    setWantsHookup(initialized.wantsHookup ?? false);
    setPhotoPaths(initialized.photoPaths ?? []);
  }, [initialized, loadedId]);

  async function uploadFiles(files: File[], kind: 'profile' | 'selfie') {
    setError(''); setNotice(''); setUploading(true);
    try {
      if (kind === 'profile' && photoPaths.length + files.length > 5) throw new Error('Choose up to five profile photos.');
      const paths: string[] = []; const previews: string[] = [];
      for (const source of files) {
        const file = await optimizeImage(source);
        const response = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: file.type as UploadUrlRequestContentType } });
        const result = await fetch(response.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
        if (!result.ok) throw new Error('Photo upload did not complete. Please try again.');
        paths.push(response.objectPath); previews.push(URL.createObjectURL(file));
      }
      if (kind === 'selfie') {
        setSelfiePreview(previews[0]);
        await submitSelfie.mutateAsync({ data: { selfiePath: paths[0] } });
        await Promise.all([client.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }), client.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() })]);
        setNotice('Your selfie has been submitted. Verification is pending review.');
      } else { setPhotoPaths((old) => [...old, ...paths]); setPhotoPreviews((old) => [...old, ...previews]); setNotice('Photo uploaded. Save your profile to publish the change.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed. Please try again.'); }
    finally { setUploading(false); }
  }

  function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []); if (files.length) void uploadFiles(files, 'profile'); e.target.value = '';
  }
  function onSelfieChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) void uploadFiles([file], 'selfie'); e.target.value = '';
  }
  function removePhoto(index: number) {
    setPhotoPaths((old) => old.filter((_, i) => i !== index));
    setPhotoPreviews((old) => old.filter((_, i) => i !== index));
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    if (!photoPaths.length) { setError('Keep at least one profile photo.'); return; }
    const data: ProfileUpdate = { fullName: fullName.trim(), dateOfBirth, area: area.trim(), bio: bio.trim(), photoPaths, wantsRelationship, wantsFriendsWithBenefits, wantsHookup };
    try {
      const saved = await update.mutateAsync({ data });
      client.setQueryData(getGetMyProfileQueryKey(), saved);
      client.setQueryData(getGetCurrentUserQueryKey(), saved);
      setNotice('Your profile is saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'We could not save your profile. Try again.'); }
  }
  async function signOut() {
    try { await logout.mutateAsync(); } finally {
      client.clear(); setPhotoPreviews([]); setSelfiePreview(''); navigate('/');
    }
  }
  async function confirmDelete() {
    const answer = window.prompt('This permanently deletes your account and profile. Type DELETE to confirm.');
    if (answer !== 'DELETE') return;
    setDeleting(true);
    try { await removeAccount.mutateAsync(); client.clear(); navigate('/'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Account deletion failed. Please try again.'); }
    finally { setDeleting(false); }
  }

  if (current.isLoading || (current.data && profile.isLoading)) return <AppShell><div className="loading-view"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card short" /></div></AppShell>;
  if (current.isError || !current.data) return <AppShell><div className="state-card"><div className="state-icon"><KeyRound /></div><h2>Sign in to your profile</h2><p>Your account session has ended or could not be found.</p><Button onClick={() => navigate('/')}>Go to sign in <ArrowRight size={16} /></Button></div></AppShell>;
  if (profile.isError && !profile.data) return <AppShell><div className="state-card"><div className="state-icon"><CircleAlert /></div><h2>We couldn’t load your profile</h2><p>Please check your connection and try again.</p><Button onClick={() => void profile.refetch()}>Try again</Button></div></AppShell>;

  const pending = !!user?.verificationSelfieSubmitted && !user.isVerified;
  const uploadedImage = (path: string) => path.startsWith('blob:') ? path : profilePhotoUrl(path);
  return <AppShell>
    <section className="profile-page fade-in">
      <div className="profile-welcome">
        <div><div className="eyebrow"><span className="eyebrow-line" /> Your Orbit Zone profile</div><h1 className="profile-title">Hello, {user?.fullName?.split(' ')[0] || 'there'}<span className="title-period">.</span></h1><p>Make this feel like you. You’re always in control of what you share.</p></div>
      <div className="profile-actions"><Button variant="quiet" onClick={signOut} disabled={logout.isPending} testId="button-sign-out"><LogOut size={16} /> {logout.isPending ? 'Signing out…' : 'Sign out'}</Button></div>
      </div>
      <div className="profile-grid">
        <div className="profile-main">
          <section className="profile-card soft-shadow">
            <div className="section-head"><div className="section-icon"><UserRound size={18} /></div><div><h2>Your details</h2><p>These details help your profile feel like you.</p></div></div>
            <form className="profile-form" onSubmit={saveProfile}>
              <Field label="Full name"><input required minLength={2} maxLength={80} value={fullName} onChange={(e) => setFullName(e.target.value)} data-testid="profile-full-name" /></Field>
              <div className="two-fields">
                <Field label="Gender"><input value={gender === 'female' ? 'Woman' : 'Man'} disabled aria-describedby="gender-locked" data-testid="profile-gender" /><span className="field-hint" id="gender-locked">Gender is set at signup to protect profile integrity.</span></Field>
                <Field label="Date of birth"><input required type="date" max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().slice(0, 10)} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} data-testid="profile-dob" /></Field>
              </div>
              <Field label="Area in Lokoja"><span className="select-shell"><select required value={area} onChange={(e) => setArea(e.target.value)} data-testid="profile-area"><option value="">Choose your area</option>{['Adankolo','Felele','Ganaja','Lokongoma','Old Market','Phase II','Crusher','Other Lokoja area'].map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={16} /></span></Field>
              <Field label="About you" hint={`${bio.length}/240`}><textarea rows={4} maxLength={240} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="A little about what makes you, you." data-testid="profile-bio" /></Field>
              <section className="category-preferences" aria-labelledby="profile-preferences-title">
                <div><span className="field-label" id="profile-preferences-title">What are you open to?</span><p className="field-hint">Choose the connection types you would like to see.</p></div>
                <label className="check-row"><input type="checkbox" checked={wantsRelationship} onChange={(event) => setWantsRelationship(event.target.checked)} data-testid="profile-preference-relationship" /><span>Relationship</span></label>
                <label className="check-row"><input type="checkbox" checked={wantsFriendsWithBenefits} onChange={(event) => setWantsFriendsWithBenefits(event.target.checked)} data-testid="profile-preference-friends-with-benefits" /><span>Friends with Benefits</span></label>
                <label className="check-row"><input type="checkbox" checked={wantsHookup} onChange={(event) => setWantsHookup(event.target.checked)} data-testid="profile-preference-hookup" /><span>Hookup</span></label>
              </section>
              <div className="photo-label-row"><span className="field-label">Your photos</span><span className="photo-count">{photoPaths.length}/5 photos</span></div>
              <div className="photo-picker-row profile-photos">
                {photoPaths.map((path, i) => <div className="photo-thumb" key={`${path}-${i}`}><img src={photoPreviews[i] || uploadedImage(path)} alt={`Profile photo ${i + 1}`} loading="lazy" /><button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(i)} data-testid={`profile-remove-photo-${i}`}><X size={14} /></button></div>)}
                {photoPaths.length < 5 && <label className={`photo-add ${uploading ? 'disabled' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={uploading} onChange={onPhotoChange} data-testid="profile-add-photo" /><ImagePlus size={21} /><span>{uploading ? 'Uploading…' : 'Add photos'}</span></label>}
              </div>
              <p className="field-hint photo-hint">Photos load only as needed and are optimized for mobile data.</p>
              {error && <div className="inline-error" role="alert" data-testid="status-profile-error"><CircleAlert size={16} />{error}</div>}
              {notice && <div className="inline-success" role="status" data-testid="status-profile-notice"><Check size={16} />{notice}</div>}
              <div className="save-row"><Button type="submit" disabled={update.isPending || uploading} testId="button-save-profile">{update.isPending ? <><LoaderCircle size={16} className="spin" /> Saving…</> : <>Save changes <ArrowRight size={16} /></>}</Button><span>Changes won’t publish until you save.</span></div>
            </form>
          </section>
        </div>
        <aside className="profile-side">
          <section className="verify-card">
             <div className="verify-topline"><span className="verify-illustration"><ShieldCheck size={25} /></span><span className={`verify-badge ${user?.isVerified ? 'verified' : pending ? 'pending' : ''}`} data-testid="status-verification">{user?.isVerified ? 'Verified' : pending ? 'In review' : 'Optional'}</span></div>
            <h2>{user?.isVerified ? 'You’re verified' : pending ? 'Selfie received' : 'Add a little reassurance'}</h2>
            <p>{user?.isVerified ? 'Your profile has been verified by the Orbit Zone team.' : pending ? 'Your selfie is with our team for a manual review. We’ll update your status here.' : 'Submit a quick selfie for manual verification. It helps people feel more at ease.'}</p>
            {selfiePreview && <img src={selfiePreview} className="selfie-preview" alt="Selfie submitted for verification" loading="lazy" />}
            {!user?.isVerified && <label className={`selfie-button ${uploading ? 'disabled' : ''}`}><input type="file" accept="image/jpeg,image/png,image/webp" capture="user" hidden disabled={uploading} onChange={onSelfieChange} data-testid="input-verification-selfie" /><Camera size={16} />{uploading ? 'Submitting…' : pending ? 'Replace selfie' : 'Submit a selfie'}</label>}
            <div className="privacy-mini"><ShieldCheck size={14} /><span>Your selfie is used only for identity verification.</span></div>
          </section>
          <section className="account-card">
            <div className="section-head small-head"><div className="section-icon"><Activity size={17} /></div><div><h3>Account</h3><p>Manage your Orbit Zone account.</p></div></div>
            <button className="delete-link" type="button" onClick={confirmDelete} disabled={deleting} data-testid="button-delete-account"><Trash2 size={15} />{deleting ? 'Deleting account…' : 'Delete my account'}</button>
            <p className="delete-note">This is permanent. Your profile and photos will be removed.</p>
          </section>
        </aside>
      </div>
      <div className="profile-bottom-note"><Waves size={17} /><span>A good connection starts with showing up as yourself.</span></div>
    </section>
  </AppShell>;
}

function DiscoverRoute() {
  return <AppShell><DiscoverPage /></AppShell>;
}
function FullProfileRoute() { return <AppShell><FullProfilePage /></AppShell>; }
function MatchesRoute() { return <AppShell><MatchesPage /></AppShell>; }
function ChatRoute() { return <AppShell><ChatPage /></AppShell>; }
function SearchRoute() { return <AppShell><SearchPage /></AppShell>; }
function PlanRoute() { return <AppShell><PlanPage /></AppShell>; }
function AdminRoute() { return <AppShell><AdminPage /></AppShell>; }

function Router() {
  const [location, navigate] = useLocation();
  const session = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request: { credentials: 'include' } });
  useEffect(() => {
    if (session.data && location === '/') navigate('/discover');
  }, [session.data, location, navigate]);
  if (session.isLoading) return <AppShell><div className="loading-view"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-card" /></div></AppShell>;
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={LandingPage} />
    <Route path="/login" component={AuthPage} />
    <Route path="/register" component={AuthPage} />
    <Route path="/profile" component={ProfilePage} />
    <Route path="/discover" component={DiscoverRoute} />
    <Route path="/profiles/:profileId" component={FullProfileRoute} />
    <Route path="/matches" component={MatchesRoute} />
    <Route path="/chat/:matchId" component={ChatRoute} />
    <Route path="/search" component={SearchRoute} />
    <Route path="/plan" component={PlanRoute} />
    <Route path="/admin" component={AdminRoute} />
    <Route path="/terms" component={TermsPage} />
    <Route path="/privacy" component={PrivacyPage} />
    <Route path="/contact" component={ContactPage} />
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}>
    <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider>
  </QueryClientProvider>;
}

export default App;
