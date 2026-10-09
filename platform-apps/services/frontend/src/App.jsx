import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Clock3,
  Command,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react';

const initialJobs = [
  { id: 'job-2841', title: 'Rebuild search index', detail: 'catalog / production', status: 'running', created_at: '2026-10-05T10:42:00Z', duration: '00:18' },
  { id: 'job-2840', title: 'Import partner inventory', detail: 'northstar / 18,240 records', status: 'queued', created_at: '2026-10-05T10:39:00Z', duration: '—' },
  { id: 'job-2839', title: 'Generate monthly report', detail: 'finance / September', status: 'completed', created_at: '2026-10-05T10:31:00Z', duration: '02:14' },
  { id: 'job-2838', title: 'Sync customer profiles', detail: 'crm / 3,802 records', status: 'completed', created_at: '2026-10-05T10:20:00Z', duration: '00:46' },
  { id: 'job-2837', title: 'Refresh product images', detail: 'media / 246 assets', status: 'failed', created_at: '2026-10-05T10:08:00Z', duration: '00:09' },
];

const filters = ['All jobs', 'Running', 'Queued', 'Completed', 'Failed'];

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function normalizeJob(job, index = 0) {
  return {
    id: String(job.id ?? `job-${Date.now()}-${index}`),
    title: job.title ?? job.name ?? 'Untitled job',
    detail: job.detail ?? job.description ?? 'Submitted from dashboard',
    status: String(job.status ?? 'queued').toLowerCase(),
    created_at: job.created_at ?? job.createdAt ?? new Date().toISOString(),
    duration: job.duration ?? '—',
  };
}

function App() {
  const [jobs, setJobs] = useState(initialJobs);
  const [isLive, setIsLive] = useState(false);
  const [filter, setFilter] = useState('All jobs');
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadJobs() {
    try {
      const response = await fetch('/api/items');
      if (!response.ok) throw new Error('API response was not successful');
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.items;
      if (!Array.isArray(rows)) throw new Error('Unexpected items response');
      setJobs(rows.map(normalizeJob));
      setIsLive(true);
    } catch {
      setIsLive(false);
    }
  }

  useEffect(() => {
    loadJobs();
  }, []);

  const counts = jobs.reduce((total, job) => {
    total[job.status] = (total[job.status] ?? 0) + 1;
    return total;
  }, {});
  const visibleJobs = jobs.filter((job) => {
    const matchesFilter = filter === 'All jobs' || job.status === filter.toLowerCase();
    const matchesQuery = `${job.title} ${job.detail} ${job.id}`.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  });
  const completedToday = counts.completed ?? 0;
  const runningJobs = counts.running ?? 0;
  const queueDepth = counts.queued ?? 0;

  async function createJob(event) {
    event.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const nextJob = normalizeJob({
      id: `job-${Date.now().toString().slice(-4)}`,
      title: title.trim(),
      detail: detail.trim() || 'Submitted from dashboard',
      status: 'queued',
      created_at: new Date().toISOString(),
    });
    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextJob.title, description: nextJob.detail }),
      });
      if (!response.ok) throw new Error('API response was not successful');
      const created = await response.json().catch(() => nextJob);
      setJobs((current) => [normalizeJob(created), ...current]);
      setIsLive(true);
    } catch {
      setJobs((current) => [nextJob, ...current]);
      setIsLive(false);
    } finally {
      setTitle('');
      setDetail('');
      setSubmitting(false);
      setShowModal(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#queue" aria-label="Relay home">
          <span className="brand-mark"><Layers3 size={19} strokeWidth={2.3} /></span>
          <span>relay<span className="brand-period">.</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar">E</span>
          <span className="workspace-copy"><strong>ecs-platform</strong><small>Development</small></span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#queue"><Layers3 size={17} /><span>Work queue</span><span className="nav-count">{jobs.length}</span></a>
          <a className="nav-link" href="#services" onClick={(event) => event.preventDefault()}><Server size={17} /><span>Services</span></a>
          <a className="nav-link" href="#activity" onClick={(event) => event.preventDefault()}><Activity size={17} /><span>Activity</span></a>
        </nav>
        <div className="sidebar-bottom">
          <div className="cluster-card">
            <div className="cluster-heading"><span className="online-dot" />Cluster healthy</div>
            <div className="cluster-name">ecs-dev-01</div>
            <div className="cluster-meta"><span>us-east-1</span><span>2 services</span></div>
            <div className="cluster-meter"><span /></div>
            <div className="cluster-foot"><span>CPU utilization</span><strong>34%</strong></div>
          </div>
          <button className="profile-button" type="button">
            <span className="profile-avatar">H</span><span className="profile-copy"><strong>Habib</strong><small>Platform engineer</small></span><ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <main className="main-content" id="queue">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Work queue</strong></div>
          <div className="topbar-actions">
            <span className={`connection-pill ${isLive ? 'connected' : ''}`}><span className="connection-dot" />{isLive ? 'API connected' : 'Preview mode'}</span>
            <button className="icon-button refresh-button" type="button" onClick={loadJobs} title="Refresh jobs" aria-label="Refresh jobs"><RefreshCw size={16} /></button>
            <span className="topbar-divider" />
            <button className="help-button" type="button" title="Keyboard shortcuts"><Command size={14} /><span>K</span></button>
          </div>
        </header>

        <div className="page-wrap">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" />MONDAY, OCTOBER 5, 2026</div>
              <h1>Work queue<span className="heading-period">.</span></h1>
              <p className="page-subtitle">A clear view of everything moving through your platform.</p>
            </div>
            <button className="primary-button" type="button" onClick={() => setShowModal(true)}><Plus size={17} strokeWidth={2.5} /> Create job</button>
          </section>

          <section className="metrics-grid" aria-label="Queue overview">
            <article className="metric-card metric-total">
              <div className="metric-top"><span className="metric-label">Total jobs today</span><span className="metric-icon"><Layers3 size={17} /></span></div>
              <div className="metric-value">{String(jobs.length + 124).padStart(3, '0')}</div>
              <div className="metric-foot"><span className="trend positive"><ArrowUpRight size={13} />12.8%</span><span>vs. yesterday</span></div>
              <div className="sparkline spark-total" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span className="metric-label">In progress</span><span className="metric-icon icon-green"><Activity size={17} /></span></div>
              <div className="metric-value">{String(runningJobs + 2).padStart(2, '0')}</div>
              <div className="metric-foot"><span className="status-indicator running-indicator" /><span>Across 2 services</span></div>
              <div className="metric-mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span className="metric-label">Waiting in queue</span><span className="metric-icon icon-yellow"><Clock3 size={17} /></span></div>
              <div className="metric-value">{String(queueDepth + 7).padStart(2, '0')}</div>
              <div className="metric-foot"><span className="trend neutral"><ArrowDownRight size={13} />4.2%</span><span>vs. last hour</span></div>
              <div className="queue-track"><span /></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span className="metric-label">Completed today</span><span className="metric-icon icon-blue"><CircleCheck size={17} /></span></div>
              <div className="metric-value">{String(completedToday + 115).padStart(3, '0')}</div>
              <div className="metric-foot"><span className="metric-muted">98.6%</span><span>success rate</span></div>
              <div className="completion-track"><span /></div>
            </article>
          </section>

          <section className="queue-panel" aria-label="Jobs">
            <div className="queue-panel-header">
              <div><div className="panel-title-row"><h2>Recent jobs</h2><span className="live-label"><span />LIVE</span></div><p>Track processing across your services</p></div>
              <div className="table-tools">
                <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search jobs" aria-label="Search jobs" /><kbd>/</kbd></label>
                <button className="filter-button" type="button" onClick={() => setFilter(filters[(filters.indexOf(filter) + 1) % filters.length])}><span>{filter}</span><ChevronDown size={14} /></button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>JOB</th><th>STATUS</th><th>CREATED</th><th>DURATION</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {visibleJobs.map((job) => <tr key={job.id}>
                    <td><div className="job-cell"><span className={`job-icon ${job.status}`}><Layers3 size={15} /></span><span className="job-copy"><strong>{job.title}</strong><small>{job.detail}<span className="job-id"> · {job.id}</span></small></span></div></td>
                    <td><span className={`status-tag ${job.status}`}><span />{job.status}</span></td>
                    <td className="time-cell">{formatTime(job.created_at)} <span className="time-zone">UTC</span></td>
                    <td className="duration-cell">{job.duration}</td>
                    <td className="row-action"><button type="button" title={`Open ${job.title}`} aria-label={`Open ${job.title}`}><ChevronDown size={15} /></button></td>
                  </tr>)}
                </tbody>
              </table>
              {visibleJobs.length === 0 && <div className="empty-state"><Search size={19} /><strong>No jobs found</strong><span>Try another search or status filter.</span></div>}
            </div>
            <footer className="table-footer"><span>Showing <strong>{visibleJobs.length}</strong> of <strong>{jobs.length}</strong> jobs</span><button type="button" onClick={loadJobs}>Refresh list <RefreshCw size={13} /></button></footer>
          </section>

          <footer className="page-footer"><span><span className="footer-pulse" />All systems operational</span><span>Last checked just now <span className="footer-separator">·</span> <a href="#status" onClick={(event) => event.preventDefault()}>System status <ArrowUpRight size={12} /></a></span></footer>
        </div>
      </main>

      {showModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowModal(false); }}>
        <section className="job-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-header"><span className="modal-icon"><Plus size={18} /></span><button className="icon-button" type="button" onClick={() => setShowModal(false)} title="Close" aria-label="Close"><X size={17} /></button></div>
          <h2 id="modal-title">Create a job</h2><p className="modal-subtitle">Add work to the platform queue.</p>
          <form onSubmit={createJob}>
            <label className="form-label">Job name<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Rebuild search index" maxLength={80} required /></label>
            <label className="form-label">Details <span>Optional</span><textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="What should this job process?" rows={3} maxLength={180} /></label>
            <div className="modal-info"><CircleAlert size={15} /><span>New jobs are added to the default queue.</span></div>
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setShowModal(false)}>Cancel</button><button className="primary-button" type="submit" disabled={!title.trim() || submitting}>{submitting ? 'Creating...' : <><Check size={16} /> Add to queue</>}</button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}

export default App;