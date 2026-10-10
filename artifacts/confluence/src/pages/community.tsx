import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import { io } from 'socket.io-client';
import {
  ArrowLeft, ArrowRight, Check, CircleAlert, Heart, LoaderCircle, MapPin,
  MessageCircle, RefreshCw, Search, ShieldCheck, Sparkles, Send, Flag, Ban,
} from 'lucide-react';
import {
  getGetCurrentUserQueryKey, getGetMatchMessagesQueryKey, getGetMatchesQueryKey,
  getGetMyPlanQueryKey, getGetFullProfileQueryKey,
  getSearchProfilesQueryKey,
  useGetCurrentUser, useGetFullProfile, useGetMatches, useGetMatchMessages,
  useGetMyPlan, useMarkMatchRead, useSearchProfiles, useSendMatchMessage,
  useSubmitReport, useBlockUser, useInitializePayment, useVerifyPayment,
} from '@workspace/api-client-react';
import type { Message, SearchProfilesParams, ReportInput } from '@workspace/api-client-react';
import { profilePhotoUrl } from '@/lib/profile-photo-url';

const request = { credentials: 'include' as const };
const imageUrl = profilePhotoUrl;
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Please try again.';

function Heading({ eyebrow, title, copy, action }: { eyebrow: string; title: ReactNode; copy: string; action?: ReactNode }) {
  return <div className="community-heading"><div><div className="eyebrow"><span className="eyebrow-line" />{eyebrow}</div><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function LoadingState() {
  return <section className="community-page"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-card" /></section>;
}

function ErrorState({ title, retry }: { title: string; retry: () => void }) {
  return <section className="discover-state"><div className="state-icon"><CircleAlert size={21} /></div><h2>{title}</h2><p>We couldn’t load this just now. Check your connection and try again.</p><button className="btn btn-primary" onClick={retry}><RefreshCw size={15} /> Try again</button></section>;
}

function ProfileCard({ profile }: { profile: { id: string; fullName: string; age: number; area: string; photoPath: string; isVerified: boolean } }) {
  return <Link href={`/profiles/${profile.id}`} className="community-panel person-card" data-testid={`card-person-${profile.id}`}>
    <img src={imageUrl(profile.photoPath)} alt={`Profile photo of ${profile.fullName}`} loading="lazy" />
    <div className="person-card-copy"><h2>{profile.fullName}, {profile.age}{profile.isVerified && <Check size={14} style={{ color: '#bf4965', verticalAlign: 'middle', marginLeft: 5 }} />}</h2><p><MapPin size={12} style={{ verticalAlign: 'middle' }} /> {profile.area}, Lokoja</p></div>
  </Link>;
}

export function FullProfilePage() {
  const { profileId = '' } = useParams<{ profileId: string }>();
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const profile = useGetFullProfile(profileId, { query: { queryKey: getGetFullProfileQueryKey(profileId), retry: false }, request });
  const plan = useGetMyPlan({ query: { queryKey: getGetMyPlanQueryKey(), retry: false }, request });
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const matches = useGetMatches({ query: { queryKey: getGetMatchesQueryKey(), retry: false, enabled: !!current.data }, request });
  const reportMutation = useSubmitReport({ request });
  const blockMutation = useBlockUser({ request });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportInput['reason']>('fake_profile');
  const [reportDetails, setReportDetails] = useState('');
  const [safetyMessage, setSafetyMessage] = useState('');
  const isMatch = !!matches.data?.matches.some((match) => match.profile.id === profileId);
  const canConnect = !!plan.data && (plan.data.isWoman || plan.data.premiumActive);
  if (profile.isLoading) return <LoadingState />;
  if (profile.isError || !profile.data) return <section className="community-page"><ErrorState title="Profile unavailable" retry={() => void profile.refetch()} /></section>;
  const person = profile.data;
  async function submitReport(event: FormEvent) {
    event.preventDefault(); setSafetyMessage('');
    try { await reportMutation.mutateAsync({ data: { targetUserId: person.id, reason: reportReason, ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}) } }); setReportOpen(false); setSafetyMessage('Report sent to our moderation team. Thank you for helping keep Orbit Zone safe.'); }
    catch (error) { setSafetyMessage(messageOf(error)); }
  }
  async function blockPerson() {
    if (!window.confirm(`Block ${person.fullName}? They will no longer be able to view or message you.`)) return;
    try { await blockMutation.mutateAsync({ userId: person.id }); await client.invalidateQueries({ queryKey: getGetFullProfileQueryKey(profileId) }); navigate('/discover'); }
    catch (error) { setSafetyMessage(messageOf(error)); }
  }
  return <section className="community-page">
    <button className="btn btn-quiet" onClick={() => history.length > 1 ? window.history.back() : navigate('/discover')}><ArrowLeft size={15} /> Back</button>
    <div className="community-panel profile-detail" style={{ marginTop: 16 }}>
      <div className="detail-gallery">{person.photoPaths.map((path, index) => <img key={`${path}-${index}`} src={imageUrl(path)} alt={`${person.fullName}, photo ${index + 1}`} loading={index ? 'lazy' : 'eager'} />)}</div>
      <div className="detail-copy">
        <div className="detail-meta"><MapPin size={14} /> {person.area}, Lokoja</div>
        <h2>{person.fullName}, {person.age}</h2>
        {person.isVerified && <span className="verified-tag" style={{ background: '#edf7f2', color: '#366b5b', borderColor: '#d9eee4' }}><ShieldCheck size={13} /> Verified member</span>}
        <p className="detail-bio">{person.bio || 'A new neighbor, ready to meet someone genuine.'}</p>
        <div className="upgrade-notice"><strong>Meet with care.</strong> Orbit Zone is for adults 18+ in Lokoja. Take your time, keep early conversations in the app, and meet in a public place.</div>
        <div className="detail-actions">
          {isMatch ? <button className="btn btn-primary" onClick={() => navigate(`/chat/${matches.data?.matches.find((match) => match.profile.id === profileId)?.id}`)}><MessageCircle size={16} /> Open conversation</button> :
            canConnect ? <Link href="/discover" className="btn btn-primary"><Heart size={16} /> Like in Discover</Link> :
              <Link href="/plan" className="btn btn-primary"><Sparkles size={16} /> Upgrade to connect</Link>}
          <Link href="/matches" className="btn btn-outline">Your matches</Link>
        </div>
        {!canConnect && <p className="field-hint" style={{ marginTop: 12 }}>Browsing profiles is free. Men need Premium to match, message and connect; plan access is separate from any date or service.</p>}
        <div className="safety-actions"><button className="btn btn-outline" onClick={() => setReportOpen((value) => !value)}><Flag size={15}/> Report profile</button><button className="btn btn-quiet" onClick={() => void blockPerson()} disabled={blockMutation.isPending}><Ban size={15}/> {blockMutation.isPending ? 'Blocking…' : 'Block'}</button></div>
        {reportOpen && <form className="report-form" onSubmit={submitReport}><h3>Tell us what happened</h3><label className="field-wrap"><span className="field-label">Reason</span><select value={reportReason} onChange={e=>setReportReason(e.target.value as ReportInput['reason'])}><option value="fake_profile">Fake profile</option><option value="harassment">Harassment</option><option value="scam">Scam</option><option value="underage">Underage concern</option><option value="other">Other</option></select></label><label className="field-wrap"><span className="field-label">Details (optional)</span><textarea maxLength={500} rows={3} value={reportDetails} onChange={e=>setReportDetails(e.target.value)} placeholder="Share only what helps our team review this report."/></label><button className="btn btn-primary" disabled={reportMutation.isPending}>{reportMutation.isPending?'Sending…':'Send report'}</button></form>}
        {safetyMessage && <p className="safety-feedback" role="status">{safetyMessage}</p>}
      </div>
    </div>
  </section>;
}

export function MatchesPage() {
  const query = useGetMatches({ query: { queryKey: getGetMatchesQueryKey(), retry: false }, request });
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const plan = useGetMyPlan({ query: { queryKey: getGetMyPlanQueryKey(), retry: false }, request });
  if (query.isLoading || current.isLoading) return <LoadingState />;
  if (query.isError || current.isError || !current.data) return <section className="community-page"><ErrorState title="Your matches haven’t loaded" retry={() => void query.refetch()} /></section>;
  if (!plan.isLoading && plan.data && !plan.data.isWoman && !plan.data.premiumActive) return <section className="community-page"><Heading eyebrow="A good start" title={<>Your <span>matches.</span></>} copy="Mutual interest, ready for a real conversation."/><div className="discover-state"><div className="state-icon"><Sparkles /></div><h2>Premium is needed to connect.</h2><p>Men need an active Premium plan to use matching and messaging. Your conversations will be here when your plan is active.</p><Link href="/plan" className="btn btn-primary">View plan status <ArrowRight size={16} /></Link></div></section>;
  const matches = query.data?.matches ?? [];
  return <section className="community-page">
    <Heading eyebrow="The beginning of something" title={<>Your <span>matches.</span></>} copy="A mutual hello is a lovely place to start. Keep it kind, local, and at your own pace." action={<Link href="/discover" className="btn btn-outline">Discover people <ArrowRight size={15} /></Link>} />
    <div className="community-panel">
      {matches.length === 0 ? <div className="discover-state" style={{ boxShadow: 'none', border: 0 }}><div className="state-icon"><Heart /></div><h2>No mutual hellos yet.</h2><p>When someone you like likes you back, your match will appear here. Keep meeting your neighbors.</p><Link href="/discover" className="btn btn-primary">Go to Discover <ArrowRight size={16} /></Link></div> :
        matches.map((match) => <Link key={match.id} href={`/chat/${match.id}`} className="match-row" data-testid={`match-row-${match.id}`}>
          <img src={imageUrl(match.profile.photoPath)} alt="" loading="lazy" />
          <div><h2>{match.profile.fullName}, {match.profile.age}</h2><p>{match.lastMessage || 'You matched. Say hello when you’re ready.'}</p></div>
          {match.unreadCount > 0 && <span className="unread-pill">{match.unreadCount}</span>}
          {match.unreadCount === 0 && <MessageCircle size={17} color="#c34c69" />}
        </Link>)}
    </div>
  </section>;
}

export function ChatPage() {
  const { matchId = '' } = useParams<{ matchId: string }>();
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const plan = useGetMyPlan({ query: { queryKey: getGetMyPlanQueryKey(), retry: false }, request });
  const matches = useGetMatches({ query: { queryKey: getGetMatchesQueryKey(), retry: false }, request });
  const messages = useGetMatchMessages(matchId, { query: { queryKey: getGetMatchMessagesQueryKey(matchId), retry: false }, request });
  const send = useSendMatchMessage({ request });
  const markRead = useMarkMatchRead({ request });
  const reportMutation = useSubmitReport({ request });
  const blockMutation = useBlockUser({ request });
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportInput['reason']>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [safetyMessage, setSafetyMessage] = useState('');
  const match = matches.data?.matches.find((item) => item.id === matchId);
  const markReadRef = useRef(markRead.mutate);
  markReadRef.current = markRead.mutate;
  useEffect(() => {
    if (!matchId || !match) return;
    markReadRef.current({ matchId }, { onSuccess: () => void client.invalidateQueries({ queryKey: getGetMatchesQueryKey() }) });
  }, [client, matchId, match?.id]);
  useEffect(() => {
    if (!matchId) return;
    const socket = io({ path: '/socket.io', withCredentials: true });
    const refreshActiveConversation = () => {
      void client.invalidateQueries({ queryKey: getGetMatchMessagesQueryKey(matchId) });
      void client.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
    };
    const onMessage = (message: Message) => {
      if (message.matchId !== matchId) return;
      refreshActiveConversation();
      if (message.senderId !== current.data?.id) {
        markReadRef.current({ matchId }, { onSuccess: () => void client.invalidateQueries({ queryKey: getGetMatchesQueryKey() }) });
      }
    };
    const onMatchUpdated = (event: { matchId: string }) => {
      if (event.matchId === matchId) refreshActiveConversation();
    };
    socket.on('message:new', onMessage);
    socket.on('match:updated', onMatchUpdated);
    return () => {
      socket.off('message:new', onMessage);
      socket.off('match:updated', onMatchUpdated);
      socket.disconnect();
    };
  }, [client, current.data?.id, matchId]);
  if (current.isLoading || matches.isLoading || messages.isLoading || plan.isLoading) return <LoadingState />;
  if (matches.isError || messages.isError || !match) return <section className="community-page"><ErrorState title="Conversation unavailable" retry={() => void messages.refetch()} /></section>;
  if (plan.data && !plan.data.isWoman && !plan.data.premiumActive) return <section className="community-page"><div className="discover-state"><div className="state-icon"><Sparkles/></div><h2>Premium unlocks messaging.</h2><p>You can browse Orbit Zone for free. An active weekly Premium plan is needed for men to use matches and chat. No date or service is included in payment.</p><Link href="/plan" className="btn btn-primary">See weekly plans <ArrowRight size={16}/></Link></div></section>;
  const matchedProfile = match.profile;
  const items = messages.data?.messages ?? [];
  async function submit(e: FormEvent) {
    e.preventDefault(); const text = body.trim(); if (!text || send.isPending) return;
    setError('');
    try {
      await send.mutateAsync({ matchId, data: { body: text } });
      setBody('');
      await client.invalidateQueries({ queryKey: getGetMatchMessagesQueryKey(matchId) });
      await client.invalidateQueries({ queryKey: getGetMatchesQueryKey() });
    } catch (cause) { setError(messageOf(cause)); }
  }
  async function submitChatReport(event: FormEvent) {
    event.preventDefault(); setSafetyMessage('');
    try { await reportMutation.mutateAsync({ data: { targetUserId: matchedProfile.id, matchId, reason: reportReason, ...(reportDetails.trim()?{details:reportDetails.trim()}:{}) } }); setReportOpen(false); setSafetyMessage('Report sent to our moderation team.'); }
    catch(cause) { setSafetyMessage(messageOf(cause)); }
  }
  async function blockChatMember() {
    if (!window.confirm(`Block ${matchedProfile.fullName}? This will end your access to this conversation.`)) return;
    try { await blockMutation.mutateAsync({userId:matchedProfile.id}); await client.invalidateQueries({queryKey:getGetMatchesQueryKey()}); navigate('/matches'); }
    catch(cause) { setSafetyMessage(messageOf(cause)); }
  }
  return <section className="community-page">
    <div className="community-panel chat-layout">
      <header className="chat-top"><Link href="/matches" className="btn btn-quiet" aria-label="Back to matches"><ArrowLeft size={16} /></Link><img src={imageUrl(match.profile.photoPath)} alt="" /><div><h2>{match.profile.fullName}</h2><p>{match.profile.area}, Lokoja · 18+</p></div><span style={{ marginLeft: 'auto', color: '#4a8a6f' }}><ShieldCheck size={18} /></span><button className="chat-safety-button" type="button" onClick={()=>setReportOpen(value=>!value)} aria-label="Report this conversation"><Flag size={16}/></button><button className="chat-safety-button" type="button" onClick={()=>void blockChatMember()} aria-label="Block this member" disabled={blockMutation.isPending}><Ban size={16}/></button></header>
      <div className="chat-warning"><ShieldCheck size={15}/><span><strong>Never send money to someone you match with.</strong> Keep your personal details private and meet in a public place.</span></div>
      {reportOpen && <form className="report-form chat-report-form" onSubmit={submitChatReport}><h3>Report {match.profile.fullName}</h3><label className="field-wrap"><span className="field-label">Reason</span><select value={reportReason} onChange={e=>setReportReason(e.target.value as ReportInput['reason'])}><option value="fake_profile">Fake profile</option><option value="harassment">Harassment</option><option value="scam">Scam</option><option value="underage">Underage concern</option><option value="other">Other</option></select></label><label className="field-wrap"><span className="field-label">Details (optional)</span><textarea maxLength={500} rows={2} value={reportDetails} onChange={e=>setReportDetails(e.target.value)} placeholder="Add context for our moderation team."/></label><button className="btn btn-primary" disabled={reportMutation.isPending}>{reportMutation.isPending?'Sending…':'Send report'}</button></form>}
      {safetyMessage && <p className="safety-feedback" role="status">{safetyMessage}</p>}
      <div className="chat-messages" aria-live="polite">{items.length === 0 ? <div className="discover-state" style={{ minHeight: 170, boxShadow: 'none', border: 0, background: 'transparent' }}><h2>Start with a real hello.</h2><p>A thoughtful first message goes a long way.</p></div> : items.map((item) => <div key={item.id} className={`chat-bubble ${item.senderId === current.data?.id ? 'mine' : ''}`} data-testid={`message-${item.id}`}>{item.body}<span className="chat-time">{new Date(item.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span></div>)}</div>
      {error && <div className="inline-error" style={{ margin: '0 14px' }} role="alert"><CircleAlert size={15} />{error}</div>}
      <form className="chat-compose" onSubmit={submit}><input value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} placeholder="Write a thoughtful message…" aria-label="Message" data-testid="input-chat-message" /><button className="btn btn-primary" disabled={!body.trim() || send.isPending} type="submit" data-testid="button-send-message">{send.isPending ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}<span className="desktop-send-label">Send</span></button></form>
    </div>
  </section>;
}

export function SearchPage() {
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const plan = useGetMyPlan({ query: { queryKey: getGetMyPlanQueryKey(), retry: false }, request });
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<SearchProfilesParams['category']>('relationship');
  const [minAge, setMinAge] = useState('18');
  const [maxAge, setMaxAge] = useState('45');
  const [area, setArea] = useState('');
  const [applied, setApplied] = useState<SearchProfilesParams>({ category: 'relationship', minAge: 18, maxAge: 45 });
  const params = useMemo(() => applied, [applied]);
  const results = useSearchProfiles(params, { query: { queryKey: getSearchProfilesQueryKey(params), enabled: current.data?.gender === 'male' && (params.category !== 'hookup' || !!plan.data?.hookupActive), retry: false }, request });
  useEffect(() => {
    if (current.data?.gender === 'female') navigate('/discover');
    else if (current.isError) navigate('/login');
  }, [current.data?.gender, current.isError, navigate]);
  function submit(e: FormEvent) {
    e.preventDefault();
    const low = Number(minAge), high = Number(maxAge);
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 18 || high < low || high > 100) return;
    setApplied({ category, minAge: low, maxAge: high, ...(area.trim() ? { area: area.trim() } : {}) });
  }
  if (current.isLoading) return <LoadingState />;
  if (current.isError || !current.data) return <section className="community-page"><div className="discover-state"><div className="state-icon"><ShieldCheck /></div><h2>Sign in to continue.</h2><p>Search is available to signed-in members.</p><Link href="/login" className="btn btn-primary">Go to sign in <ArrowRight size={16} /></Link></div></section>;
  if (current.data.gender === 'female') return <section className="community-page"><div className="discover-state"><div className="state-icon"><ShieldCheck /></div><h2>Taking you to Discover.</h2><p>Search is not available for this account.</p><Link href="/discover" className="btn btn-primary">Go to Discover <ArrowRight size={16} /></Link></div></section>;
  return <section className="community-page">
    <Heading eyebrow="Find your kind of connection" title={<>Search <span>Lokoja.</span></>} copy="Choose what you’re open to, then narrow by age and area. Every profile is an adult who opted into this category." />
    <form className="community-panel search-controls" onSubmit={submit}>
      <label className="field-wrap"><span className="field-label">Looking for</span><span className="select-shell"><select value={category} onChange={(e) => setCategory(e.target.value as SearchProfilesParams['category'])}><option value="relationship">Relationship</option><option value="friends-with-benefits">Friends with benefits</option><option value="hookup">Hookup</option></select></span></label>
      <label className="field-wrap"><span className="field-label">Age from</span><input type="number" min="18" max="100" value={minAge} onChange={(e) => setMinAge(e.target.value)} /></label>
      <label className="field-wrap"><span className="field-label">Age to</span><input type="number" min="18" max="100" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} /></label>
      <label className="field-wrap"><span className="field-label">Area</span><input maxLength={80} placeholder="Any area" value={area} onChange={(e) => setArea(e.target.value)} /></label>
      <button className="btn btn-primary search-submit" type="submit"><Search size={16} /> Search</button>
    </form>
    {params.category === 'hookup' && plan.data && !plan.data.hookupActive && <div className="upgrade-notice"><strong>Hookup search needs its own weekly access.</strong> Your other browsing remains available. Activate Hookup access to search this category; this is platform feature access, not a sexual service. <Link href="/plan">View weekly plans</Link></div>}
    {results.isLoading && <div className="community-panel skeleton skeleton-card" role="status" />}
    {results.isError && plan.data && !plan.data.isWoman && !plan.data.premiumActive && params.category !== 'hookup'
      ? <div className="upgrade-notice"><strong>Premium is needed for category search.</strong> Browsing the Discover feed remains free. Men need Premium to search categories, match and message. <Link href="/plan">See weekly plans</Link></div>
      : results.isError && <ErrorState title="Search could not load" retry={() => void results.refetch()} />}
    {results.data && <>
      <p className="search-results-top">{results.data.profiles.length} profiles · {results.data.category.replaceAll('-', ' ')}</p>
      {results.data.profiles.length ? <div className="profile-grid-cards">{results.data.profiles.map((person) => <ProfileCard key={person.id} profile={person} />)}</div> :
        <div className="discover-state"><div className="state-icon"><Search /></div><h2>No profiles match those filters.</h2><p>Try widening the age range or choosing another Lokoja area.</p></div>}
    </>}
  </section>;
}

export function PlanPage() {
  const plan = useGetMyPlan({ query: { queryKey: getGetMyPlanQueryKey(), retry: false }, request });
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const client = useQueryClient();
  const initialize = useInitializePayment({ request });
  const verify = useVerifyPayment({ request });
  const [paymentState, setPaymentState] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  async function checkout(which: 'premium' | 'hookup') {
    if (checkoutBusy || !current.data) return;
    setPaymentState('');
    const defaultEmail = '';
    const email = window.prompt('Enter the email address to use for this Paystack checkout.', defaultEmail)?.trim();
    if (!email) { setPaymentState('Checkout cancelled. No payment was started.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setPaymentState('Enter a valid email address to continue.'); return; }
    setCheckoutBusy(true);
    try {
      const checkoutData = await initialize.mutateAsync({ data: { plan: which, email } });
      await loadPaystackInline();
      const paystack = new window.PaystackPop!();
      paystack.newTransaction({
        key: checkoutData.publicKey,
        email,
        amount: checkoutData.amountKobo,
        currency: checkoutData.currency,
        reference: checkoutData.reference,
        onSuccess: async (response) => {
          try {
            const verified = await verify.mutateAsync({ data: { reference: response.reference || checkoutData.reference } });
            if (verified.status === 'success') {
              setPaymentState(`${which === 'premium' ? 'Premium' : 'Hookup'} payment verified. Your access is now updated.`);
              await Promise.all([client.invalidateQueries({ queryKey: getGetMyPlanQueryKey() }), client.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() })]);
            } else setPaymentState(`Payment verification returned ${verified.status}. Access will not be enabled until the server confirms payment.`);
          } catch (error) { setPaymentState(error instanceof Error ? error.message : 'We could not verify that payment. Please contact support with your reference.'); }
          finally { setCheckoutBusy(false); }
        },
        onCancel: () => { setPaymentState('Checkout closed. No access was changed.'); setCheckoutBusy(false); },
        onError: (error) => { setPaymentState(error.message || 'Paystack reported a checkout error. Your access has not changed.'); setCheckoutBusy(false); },
      });
    } catch (error) {
      setPaymentState(error instanceof Error ? error.message : 'Checkout could not be opened. Please try again.');
      setCheckoutBusy(false);
    }
  }
  if (plan.isLoading) return <LoadingState />;
  if (plan.isError || !plan.data) return <section className="community-page"><ErrorState title="Plan status is unavailable" retry={() => void plan.refetch()} /></section>;
  const status = plan.data;
  const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not active';
  return <section className="community-page">
    <Heading eyebrow="Clear, no surprises" title={<>Your <span>plan.</span></>} copy={status.isWoman ? 'Your Orbit Zone access is ready.' : 'Choose only the weekly features that fit what you are looking for.'} />
    <section className="plan-hero"><div className="eyebrow" style={{ color: '#efb6c4' }}><span className="eyebrow-line" style={{ background: '#ef9aaf' }} /> Account access</div><h2>{status.isWoman ? 'Free access, fully yours.' : status.premiumActive ? 'Premium is active.' : 'Browse free. Connect with Premium.'}</h2><p>{status.isWoman ? 'Women can use Orbit Zone without a paid plan. Your connections are open.' : 'Free browsing stays open. Premium unlocks matching and messaging for men. Hookup search is a separate optional entitlement.'}</p></section>
    {status.isWoman ? <section className="community-panel plan-stat" style={{ marginTop: 16 }}><h3>Membership</h3><strong>Free access</strong><p>No Premium plan is required for women to use Orbit Zone.</p></section> : <>
      {((status.premiumActive && status.premiumDaysRemaining <= 1) || (status.hookupActive && status.hookupDaysRemaining <= 1)) && <div className="plan-reminder" role="status"><CircleAlert size={17}/><span><strong>Your access ends soon.</strong> {status.premiumActive && status.premiumDaysRemaining <= 1 ? 'Premium has one day or less remaining. ' : ''}{status.hookupActive && status.hookupDaysRemaining <= 1 ? 'Hookup access has one day or less remaining.' : ''} Renew below to keep it active.</span></div>}
      <div className="plan-stats">
        <section className="community-panel plan-stat"><div className="plan-stat-top"><h3>Premium</h3><span>{status.premiumActive ? 'ACTIVE' : 'NOT ACTIVE'}</span></div><strong>{status.premiumActive ? `${status.premiumDaysRemaining} days` : 'Weekly access'}</strong><p>{status.premiumActive ? `Renews by your choice · expires ${date(status.premiumUntil)}` : 'For men: match and message after mutual interest.'}</p><div className="plan-purchase"><b>₦1,500 <small>/ week</small></b><button className="btn btn-primary" onClick={()=>void checkout('premium')} disabled={checkoutBusy}>{status.premiumActive?'Renew Premium':'Get Premium'}</button></div></section>
        <section className="community-panel plan-stat"><div className="plan-stat-top"><h3>Hookup access</h3><span>{status.hookupActive ? 'ACTIVE' : 'NOT ACTIVE'}</span></div><strong>{status.hookupActive ? `${status.hookupDaysRemaining} days` : 'Optional access'}</strong><p>{status.hookupActive ? `Renews by your choice · expires ${date(status.hookupUntil)}` : 'Unlock the hookup search category. Separate from Premium.'}</p><div className="plan-purchase"><b>₦2,500 <small>/ week</small></b><button className="btn btn-primary" onClick={()=>void checkout('hookup')} disabled={checkoutBusy}>{status.hookupActive?'Renew Hookup':'Get Hookup access'}</button></div></section>
      </div>
      <p className="plan-pricing-note">All prices are in NGN and billed weekly. Payment buys access to Orbit Zone platform features only, never a date, intimacy or sexual service. Paystack securely processes checkout; access is enabled only after server verification.</p>
      {paymentState && <div className={paymentState.toLowerCase().includes('could not')||paymentState.toLowerCase().includes('valid')?'inline-error':'inline-success'} role="status">{paymentState}</div>}
      {(initialize.isError||verify.isError) && <div className="inline-error"><CircleAlert size={15}/> Payment could not be completed or verified. Your plan remains unchanged until confirmed.</div>}
    </>}
    <div className="detail-actions"><Link href="/discover" className="btn btn-primary">Back to Discover <ArrowRight size={15} /></Link>{!status.isWoman && <Link href="/search" className="btn btn-outline">Explore search categories</Link>}</div>
  </section>;
}

declare global {
  interface Window { PaystackPop?: new () => { newTransaction: (options: { key: string; email: string; amount: number; currency: string; reference: string; onSuccess: (response: { reference?: string }) => void; onCancel: () => void; onError?: (error: { message?: string }) => void }) => void } }
}

function loadPaystackInline(): Promise<void> {
  if (window.PaystackPop) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-paystack-inline]');
    if (existing) {
      existing.addEventListener('load', () => window.PaystackPop ? resolve() : reject(new Error('Paystack could not be loaded. Check your connection or content blocker.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('Paystack was blocked from loading. Disable your content blocker or try again.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v2/inline.js';
    script.async = true;
    script.dataset.paystackInline = 'true';
    script.onload = () => window.PaystackPop ? resolve() : reject(new Error('Paystack did not initialize correctly. Please try again.'));
    script.onerror = () => reject(new Error('Paystack was blocked from loading. Disable your content blocker or try again.'));
    document.head.appendChild(script);
  });
}
