import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetCurrentUser, getGetCurrentUserQueryKey, useGetDiscoveryFeed, getGetDiscoveryFeedQueryKey, useRecordSwipe } from '@workspace/api-client-react';
import type { DiscoveryProfile, SwipeInput } from '@workspace/api-client-react';
import { ArrowRight, Check, CircleAlert, Heart, LoaderCircle, MapPin, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Link } from 'wouter';

type SwipeChoice = SwipeInput['action'];

export default function DiscoverPage() {
  const client = useQueryClient();
  const current = useGetCurrentUser({
    query: { queryKey: getGetCurrentUserQueryKey(), retry: false },
    request: { credentials: 'include' },
  });
  const feed = useGetDiscoveryFeed({
    query: { queryKey: getGetDiscoveryFeedQueryKey(), retry: false, enabled: !!current.data },
    request: { credentials: 'include' },
  });
  const swipe = useRecordSwipe({ request: { credentials: 'include' } });
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [lastMatch, setLastMatch] = useState<DiscoveryProfile | null>(null);
  const [error, setError] = useState('');
  const [swipingId, setSwipingId] = useState('');

  const visibleProfiles = (feed.data?.profiles ?? []).filter((person) => !dismissed.has(person.id));
  const activeProfile = visibleProfiles[0];

  async function choose(action: SwipeChoice, person: DiscoveryProfile) {
    if (swipe.isPending) return;
    setError('');
    setSwipingId(person.id);
    setDismissed((existing) => new Set(existing).add(person.id));
    try {
      const result = await swipe.mutateAsync({ profileId: person.id, data: { action } });
      if (action === 'like' && result.matched) setLastMatch(person);
    } catch (cause) {
      setDismissed((existing) => {
        const next = new Set(existing);
        next.delete(person.id);
        return next;
      });
      setError(cause instanceof Error ? cause.message : 'That choice did not go through. Please try again.');
    } finally {
      setSwipingId('');
      await client.invalidateQueries({ queryKey: getGetDiscoveryFeedQueryKey() });
    }
  }

  async function refreshFeed() {
    setError('');
    setDismissed(new Set());
    await feed.refetch();
  }

  const photoUrl = (path: string) => `/api/storage${path}`;

  if (current.isLoading) {
    return <section className="discover-page" data-testid="page-discover-loading">
      <div className="discover-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your next hello</div><h1>Meet your <span>neighbors.</span></h1></div></div>
      <div className="discover-state" role="status" data-testid="status-discover-session-loading"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-card" /></div>
    </section>;
  }

  if (current.isError || !current.data) {
    return <section className="discover-page" data-testid="page-discover-sign-in">
      <div className="discover-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> A little closer to home</div><h1>Meet your <span>neighbors.</span></h1><p>Good connections start with people who share the same place.</p></div></div>
      <section className="discover-state">
        <div className="state-icon"><ShieldCheck size={21} /></div>
        <h2>Come in as yourself.</h2>
        <p>Discovery is for signed-in adults in Lokoja. Log in or create your account to see who is here.</p>
        <Link href="/" className="btn btn-primary discover-signin" data-testid="link-discover-sign-in">Sign in to Orbit Zone <ArrowRight size={16} /></Link>
      </section>
    </section>;
  }

  return <section className="discover-page fade-in" data-testid="page-discover">
    <div className="discover-heading">
      <div>
        <div className="eyebrow"><span className="eyebrow-line" /> Your next hello, nearby</div>
        <h1>Meet your <span>neighbors.</span></h1>
        <p>Real people from around Lokoja. Take a moment, read a little, and choose what feels right.</p>
      </div>
      <div className="discover-heading-actions">
        <span className="discover-count" data-testid="text-discover-count">{feed.isLoading ? 'Loading people' : `${visibleProfiles.length} ${visibleProfiles.length === 1 ? 'person' : 'people'} nearby`}</span>
      </div>
    </div>
    <div className="discover-layout">
      <section className="discover-stage" aria-label="People to discover">
        {error && <div className="inline-error discover-error" role="alert" data-testid="status-discover-error"><CircleAlert size={16} />{error}</div>}
        {feed.isLoading && <div className="discover-state" role="status" data-testid="status-discover-loading">
          <div className="skeleton skeleton-title" /><div className="skeleton skeleton-card" />
        </div>}
        {feed.isError && !feed.isLoading && <div className="discover-state" data-testid="state-discover-feed-error">
          <div className="state-icon"><CircleAlert size={21} /></div>
          <h2>We lost the thread.</h2>
          <p>We couldn’t load people nearby just now. Check your connection and try again.</p>
          <button className="btn btn-primary" type="button" onClick={() => void feed.refetch()} data-testid="button-retry-discovery"><RefreshCw size={15} /> Try again</button>
        </div>}
        {!feed.isLoading && !feed.isError && lastMatch && <div className="discover-state match-state" role="status" data-testid="status-mutual-match">
          <div className="state-icon"><Heart size={21} fill="currentColor" /></div>
          <h2>A mutual hello.</h2>
          <p>You and <strong data-testid={`text-match-name-${lastMatch.id}`}>{lastMatch.fullName}</strong> like each other. That’s a lovely start. You can keep discovering people nearby.</p>
          <button type="button" className="btn btn-primary" onClick={() => setLastMatch(null)} data-testid="button-continue-discovery">Keep discovering <ArrowRight size={16} /></button>
        </div>}
        {!feed.isLoading && !feed.isError && !lastMatch && !activeProfile && <div className="discover-state" data-testid="state-discover-empty">
          <div className="state-icon"><MapPin size={21} /></div>
          <h2>That’s everyone for now.</h2>
          <p>You’ve seen all the available people nearby. New neighbors may join soon; check back later.</p>
          <button type="button" className="btn btn-outline" onClick={() => void refreshFeed()} data-testid="button-refresh-discovery"><RefreshCw size={15} /> Check again</button>
        </div>}
        {!feed.isLoading && !feed.isError && !lastMatch && activeProfile && <article className="discovery-card" data-testid={`card-discovery-profile-${activeProfile.id}`}>
          <div className="discovery-photo-wrap">
            <img className="discovery-photo" src={photoUrl(activeProfile.photoPath)} alt={`Photo of ${activeProfile.fullName}`} data-testid={`img-discovery-profile-${activeProfile.id}`} />
            <div className="photo-shade" />
            <div className="photo-caption">
              <h2 data-testid={`text-discovery-name-${activeProfile.id}`}>{activeProfile.fullName}<span className="age">, {activeProfile.age}</span></h2>
              {activeProfile.isVerified && <span className="verified-tag" data-testid={`status-discovery-verified-${activeProfile.id}`}><Check size={12} /> Verified member</span>}
            </div>
          </div>
          <div className="discovery-info">
            <div className="discovery-location" data-testid={`text-discovery-area-${activeProfile.id}`}><MapPin size={14} /> {activeProfile.area}, Lokoja</div>
            <p className="discovery-bio" data-testid={`text-discovery-bio-${activeProfile.id}`}>{activeProfile.bio}</p>
            <Link href={`/profiles/${activeProfile.id}`} className="profile-open-link" data-testid={`link-full-profile-${activeProfile.id}`}>View full profile <ArrowRight size={14} /></Link>
          </div>
          <div className="swipe-actions" aria-label={`Choose whether to like or pass on ${activeProfile.fullName}`}>
            <button type="button" className="swipe-action swipe-pass" onClick={() => void choose('pass', activeProfile)} disabled={swipe.isPending} data-testid={`button-pass-${activeProfile.id}`}>
              {swipe.isPending && swipingId === activeProfile.id ? <LoaderCircle className="spin" size={17} /> : <X size={18} />} Pass
            </button>
            <button type="button" className="swipe-action swipe-like" onClick={() => void choose('like', activeProfile)} disabled={swipe.isPending} data-testid={`button-like-${activeProfile.id}`}>
              {swipe.isPending && swipingId === activeProfile.id ? <LoaderCircle className="spin" size={17} /> : <Heart size={17} />} Like
            </button>
          </div>
        </article>}
      </section>
      <aside className="discover-aside">
        <div className="aside-mark"><Heart size={17} /></div>
        <h2>Closer than you think.</h2>
        <p>Orbit Zone brings Lokoja adults together, one thoughtful introduction at a time. No rush. No pressure to be anyone but yourself.</p>
        <div className="aside-rule" />
        <div className="aside-safety"><ShieldCheck size={15} /><span>Only adults 18+ appear here. Keep first meetings public and trust your instincts.</span></div>
      </aside>
    </div>
  </section>;
}
