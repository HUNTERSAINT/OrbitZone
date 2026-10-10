import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Check, CircleAlert, LoaderCircle, Search, Shield, ShieldCheck, Users, Wallet } from 'lucide-react';
import {
  getGetAdminOverviewQueryKey, getGetAdminPaymentsQueryKey, getGetAdminReportsQueryKey,
  getGetAdminUsersQueryKey, getGetCurrentUserQueryKey, useGetAdminOverview, useGetAdminPayments,
  useGetAdminReports, useGetAdminUsers, useGetCurrentUser, useReviewUserVerification,
  useUpdateAdminReport, useUpdateAdminUserStatus,
} from '@workspace/api-client-react';

const request = { credentials: 'include' as const };
const money = (kobo: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(kobo / 100);
const date = (value: string) => new Date(value).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminPage() {
  const client = useQueryClient();
  const current = useGetCurrentUser({ query: { queryKey: getGetCurrentUserQueryKey(), retry: false }, request });
  const [search, setSearch] = useState('');
  const [reportView, setReportView] = useState<'open' | 'resolved'>('open');
  const [actionError, setActionError] = useState('');
  const overview = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey(), enabled: !!current.data?.isAdmin, retry: false }, request });
  const users = useGetAdminUsers({ search: search.trim() || undefined }, { query: { queryKey: getGetAdminUsersQueryKey({ search: search.trim() || undefined }), enabled: !!current.data?.isAdmin, retry: false }, request });
  const reports = useGetAdminReports({ status: reportView }, { query: { queryKey: getGetAdminReportsQueryKey({ status: reportView }), enabled: !!current.data?.isAdmin, retry: false }, request });
  const payments = useGetAdminPayments({ query: { queryKey: getGetAdminPaymentsQueryKey(), enabled: !!current.data?.isAdmin, retry: false }, request });
  const setStatus = useUpdateAdminUserStatus({ request });
  const verify = useReviewUserVerification({ request });
  const setReport = useUpdateAdminReport({ request });
  const refresh = async () => Promise.all([
    client.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() }),
    client.invalidateQueries({ queryKey: getGetAdminUsersQueryKey() }),
    client.invalidateQueries({ queryKey: getGetAdminReportsQueryKey() }),
  ]);

  if (current.isLoading) return <main className="admin-page"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-card"/></main>;
  if (!current.data?.isAdmin) return <main className="admin-page"><section className="discover-state"><div className="state-icon"><Shield size={22}/></div><h2>Admin access only.</h2><p>This moderation workspace is limited to Orbit Zone administrators.</p><Link href="/discover" className="btn btn-primary">Back to Orbit Zone</Link></section></main>;

  return <main className="admin-page">
    <header className="admin-header"><div><div className="eyebrow"><span className="eyebrow-line"/> Orbit Zone operations</div><h1>Safety &amp; <span>community.</span></h1><p>Moderation tools for keeping Lokoja connections respectful.</p></div><span className="admin-access"><ShieldCheck size={16}/> Admin workspace</span></header>
    {actionError && <div className="inline-error" role="alert"><CircleAlert size={15}/>{actionError}</div>}
    {overview.isError && <div className="inline-error"><CircleAlert size={16}/> Overview could not load. Refresh the page to retry.</div>}
    <section className="admin-stats">
      {overview.isLoading ? Array.from({length:4},(_,i)=><div className="admin-stat skeleton" key={i}/>) : overview.data && <>
        <article className="admin-stat"><span><Users size={16}/> Members</span><strong>{overview.data.totalUsers.toLocaleString()}</strong><small>{overview.data.femaleUsers} women · {overview.data.maleUsers} men</small></article>
        <article className="admin-stat"><span><ShieldCheck size={16}/> Active Premium</span><strong>{overview.data.activePremiumUsers.toLocaleString()}</strong><small>Current entitlements</small></article>
        <article className="admin-stat"><span><Wallet size={16}/> Weekly revenue</span><strong>{money(overview.data.weeklyRevenueKobo)}</strong><small>NGN this week</small></article>
        <article className="admin-stat"><span><CircleAlert size={16}/> Safety queue</span><strong>{reports.data?.reports.length ?? '—'}</strong><small>{reportView} reports</small></article>
      </>}
    </section>

    <section className="admin-section">
      <div className="admin-section-title"><div><h2>Members</h2><p>Review accounts, verification and access.</p></div><label className="admin-search"><Search size={16}/><input aria-label="Search members" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find a member" data-testid="admin-member-search"/></label></div>
      {users.isLoading ? <div className="skeleton skeleton-card short"/> : users.isError ? <div className="inline-error"><CircleAlert size={15}/> Members could not load.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Member</th><th>Account</th><th>Verification</th><th>Access</th><th>Actions</th></tr></thead><tbody>{(users.data?.users ?? []).map(person=><tr key={person.id}>
        <td><strong>{person.fullName}</strong><small>{person.gender} · joined {date(person.createdAt)}</small></td><td>{person.identifier}</td>
        <td><span className={`admin-pill ${person.isVerified?'good':''}`}>{person.isVerified?'Verified':person.verificationSelfieSubmitted?'Review requested':'Not verified'}</span>{person.verificationSelfiePath && <a className="admin-selfie" href={`/api/storage${person.verificationSelfiePath}`} target="_blank" rel="noreferrer">View private selfie</a>}</td>
        <td><span className={`admin-pill ${person.isBanned?'bad':'good'}`}>{person.isBanned?'Banned':'Active'}</span></td>
        <td><div className="admin-row-actions"><button type="button" className="btn btn-outline admin-action" disabled={setStatus.isPending} onClick={async()=>{setActionError('');try{await setStatus.mutateAsync({userId:person.id,data:{isBanned:!person.isBanned}});await refresh();}catch(error){setActionError(error instanceof Error?error.message:'Could not update member access.');}}}>{person.isBanned?'Unban':'Ban'}</button>
          {person.verificationSelfieSubmitted && <button type="button" className="btn btn-quiet admin-action" disabled={verify.isPending} onClick={async()=>{setActionError('');try{await verify.mutateAsync({userId:person.id,data:{isVerified:!person.isVerified}});await refresh();}catch(error){setActionError(error instanceof Error?error.message:'Could not update verification.');}}}>{person.isVerified?'Revoke verification':'Approve verification'}</button>}</div></td>
      </tr>)}</tbody></table>{!users.data?.users.length && <p className="admin-empty">No members found for that search.</p>}</div>}
    </section>
    <section className="admin-section">
      <div className="admin-section-title"><div><h2>Safety reports</h2><p>Review member-submitted concerns.</p></div><div className="admin-switch"><button className={reportView==='open'?'active':''} onClick={()=>setReportView('open')}>Open</button><button className={reportView==='resolved'?'active':''} onClick={()=>setReportView('resolved')}>Resolved</button></div></div>
      {reports.isLoading ? <div className="skeleton skeleton-card short"/> : reports.isError ? <div className="inline-error"><CircleAlert size={15}/> Reports could not load.</div> : !reports.data?.reports.length ? <div className="admin-empty">No {reportView} reports right now.</div> : <div className="admin-report-list">{reports.data.reports.map(report=><article className="admin-report" key={report.id}><div className="admin-report-top"><span className={`admin-pill ${report.status==='open'?'bad':'good'}`}>{report.status}</span><time>{date(report.createdAt)}</time></div><h3>{report.reason.replaceAll('_',' ')}</h3><p><strong>Reported member:</strong> {report.targetName || 'Unavailable'} · <strong>From:</strong> {report.reporterName || 'Unavailable'}</p>{report.details && <blockquote>{report.details}</blockquote>}{report.matchId && <small>Conversation reference: {report.matchId}</small>}{report.status==='open' && <button className="btn btn-primary admin-action" disabled={setReport.isPending} onClick={async()=>{setActionError('');try{await setReport.mutateAsync({reportId:report.id,data:{status:'resolved'}});await refresh();}catch(error){setActionError(error instanceof Error?error.message:'Could not resolve report.');}}}><Check size={15}/> Mark resolved</button>}</article>)}</div>}
    </section>
    <section className="admin-section">
      <div className="admin-section-title"><div><h2>Recent payments</h2><p>Transactions returned by the payment service.</p></div></div>
      {payments.isLoading ? <div className="skeleton skeleton-card short"/> : payments.isError ? <div className="inline-error"><CircleAlert size={15}/> Payments could not load.</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Reference</th><th>Member</th><th>Plan</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{(payments.data?.payments ?? []).map(payment=><tr key={payment.id}><td>{payment.reference}</td><td>{payment.userIdentifier || 'Unavailable'}</td><td>{payment.plan}</td><td>{money(payment.amountKobo)}</td><td><span className={`admin-pill ${payment.status==='success'?'good':payment.status==='failed'?'bad':''}`}>{payment.status}</span></td><td>{date(payment.createdAt)}</td></tr>)}</tbody></table>{!payments.data?.payments.length&&<p className="admin-empty">No payments to show.</p>}</div>}
    </section>
    {(setStatus.isPending||verify.isPending||setReport.isPending)&&<div className="admin-saving" role="status"><LoaderCircle size={15} className="spin"/> Saving moderation decision</div>}
  </main>;
}
