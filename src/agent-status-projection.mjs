import { clean, insist, validatePolicy, authorizedProjects } from './domain.mjs';

const agentIdPattern = /^[a-z0-9][a-z0-9-]{0,39}\/[a-z0-9][a-z0-9-]{0,39}$/;
const repoPattern = /^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/i;
const providerIdPattern = /^[a-z0-9][a-z0-9._:-]{0,39}$/i;

function exact(value, keys, code = 'AGENT_CATALOG', message = 'Objeto de catálogo no válido.') {
  insist(value && typeof value === 'object' && !Array.isArray(value), code, message);
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(key => keys.includes(key)), code, message);
}

function sanitizeProvider(rawProvider) {
  if (!rawProvider || typeof rawProvider !== 'object' || Array.isArray(rawProvider)) {
    return { provider_id: 'unknown', provider_type: 'synthetic-fixture', adapter_id: 'none' };
  }
  const providerId = typeof rawProvider.provider_id === 'string' && providerIdPattern.test(rawProvider.provider_id)
    ? rawProvider.provider_id
    : (typeof rawProvider.id === 'string' && providerIdPattern.test(rawProvider.id) ? rawProvider.id : 'unknown');
  const providerType = typeof rawProvider.provider_type === 'string'
    ? clean(rawProvider.provider_type, 40)
    : 'synthetic-fixture';
  const adapterId = typeof rawProvider.adapter_id === 'string'
    ? clean(rawProvider.adapter_id, 80)
    : providerId;
  return { provider_id: providerId, provider_type: providerType, adapter_id: adapterId };
}

function sanitizeAuthorityLimits(rawLimits, agentProjects) {
  const allowed = Array.isArray(rawLimits?.allowed_projects)
    ? rawLimits.allowed_projects.filter(p => typeof p === 'string' && agentProjects.includes(p))
    : agentProjects;
  return {
    read_only: true,
    arbitrary_execution: false,
    allowed_projects: [...allowed],
  };
}

export function validateAgentCatalog(rawCatalog, policy) {
  insist(Array.isArray(rawCatalog) && rawCatalog.length <= 100, 'AGENT_CATALOG', 'Catálogo de agentes no válido.');
  const checkedPolicy = validatePolicy(policy);
  const members = new Set(checkedPolicy.members.map(member => member.id));
  const projectsMap = new Map(checkedPolicy.projects.map(project => [project.repo, project]));
  const seenIds = new Set();
  const result = [];

  for (const entry of rawCatalog) {
    exact(entry, ['id', 'label', 'ownerId', 'role', 'projects', 'provider', 'capabilities', 'authorityLimits'],
      'AGENT_CATALOG', 'Campos de agente no admitidos o incompletos.');

    insist(typeof entry.id === 'string' && agentIdPattern.test(entry.id) && !seenIds.has(entry.id),
      'AGENT_CATALOG', 'Identidad de agente duplicada o no válida.');
    insist(typeof entry.ownerId === 'string' && members.has(entry.ownerId) && entry.id.startsWith(`${entry.ownerId}/`),
      'AGENT_CATALOG', 'Propietario de agente no válido.');
    insist(typeof entry.label === 'string' && entry.label.length > 0 && entry.label.length <= 80,
      'AGENT_CATALOG', 'Nombre de agente no válido.');
    insist(typeof entry.role === 'string' && entry.role.length > 0 && entry.role.length <= 40,
      'AGENT_CATALOG', 'Rol de agente no válido.');
    insist(Array.isArray(entry.projects) && entry.projects.length > 0 && entry.projects.length <= 8,
      'AGENT_CATALOG', 'Proyectos de agente no válidos.');

    const agentProjects = [];
    const seenProjects = new Set();
    for (const repo of entry.projects) {
      const project = projectsMap.get(repo);
      insist(typeof repo === 'string' && repoPattern.test(repo) && project && !seenProjects.has(repo),
        'AGENT_CATALOG', 'Proyecto de agente no válido o no autorizado.');
      insist(project.readers.includes(entry.ownerId),
        'AGENT_CATALOG', 'El propietario del agente no tiene acceso al proyecto.');
      seenProjects.add(repo);
      agentProjects.push(repo);
    }

    const provider = sanitizeProvider(entry.provider);
    const capabilities = Array.isArray(entry.capabilities)
      ? entry.capabilities.filter(cap => typeof cap === 'string' && cap.length <= 80).map(cap => clean(cap, 80))
      : ['agent.config.read'];
    const authorityLimits = sanitizeAuthorityLimits(entry.authorityLimits, agentProjects);

    seenIds.add(entry.id);
    result.push({
      id: entry.id,
      label: clean(entry.label, 80),
      ownerId: entry.ownerId,
      role: clean(entry.role, 40),
      projects: agentProjects,
      provider,
      capabilities,
      authorityLimits,
    });
  }

  return structuredClone(result);
}

export function buildSyntheticFixtureCatalog(policy) {
  const checked = validatePolicy(policy);
  const projects = checked.projects;

  const catalog = [];
  for (const member of checked.members) {
    const memberProjects = projects
      .filter(p => p.readers.includes(member.id))
      .map(p => p.repo);

    if (memberProjects.length === 0) continue;

    if (member.id === 'aurora') {
      catalog.push({
        id: 'aurora/hermes',
        label: 'Hermes Aurora',
        ownerId: 'aurora',
        role: 'operator',
        projects: memberProjects,
        provider: { provider_id: 'hermes-local', provider_type: 'synthetic-fixture', adapter_id: 'adapter-hermes-v1' },
        capabilities: ['agent.config.read', 'agent.status.read'],
        authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: memberProjects },
      });
    } else if (member.id === 'marea') {
      catalog.push({
        id: 'marea/curro',
        label: 'Curro Marea',
        ownerId: 'marea',
        role: 'engineer',
        projects: memberProjects,
        provider: { provider_id: 'curro-local', provider_type: 'synthetic-fixture', adapter_id: 'adapter-curro-v1' },
        capabilities: ['agent.config.read', 'agent.status.read'],
        authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: memberProjects },
      });
    } else {
      catalog.push({
        id: `${member.id}/agent-1`,
        label: `Agente ${clean(member.label, 40)}`,
        ownerId: member.id,
        role: 'assistant',
        projects: memberProjects,
        provider: { provider_id: `${member.id}-provider`, provider_type: 'synthetic-fixture', adapter_id: 'adapter-default' },
        capabilities: ['agent.config.read'],
        authorityLimits: { read_only: true, arbitrary_execution: false, allowed_projects: memberProjects },
      });
    }
  }

  return catalog;
}

function normalizeStatus(rawStatus, seenAt) {
  if (rawStatus === 'online' || rawStatus === 'connected') return 'connected';
  if (rawStatus === 'stale' || rawStatus === 'inactive') return 'stale';
  if (rawStatus === 'offline') {
    return seenAt !== null ? 'offline' : 'unknown';
  }
  return 'unknown';
}

export function projectAgentStatus({
  catalog,
  presence,
  policy,
  requesterId,
  projectFilter = null,
  queues = null,
  now = Date.now,
} = {}) {
  const checkedPolicy = validatePolicy(policy);
  const authProjects = authorizedProjects(checkedPolicy, requesterId);
  const allowedRepos = new Set(authProjects.map(p => p.repo));

  if (projectFilter !== null) {
    insist(typeof projectFilter === 'string' && allowedRepos.has(projectFilter),
      'FORBIDDEN', 'Proyecto no autorizado.', 403);
  }

  let effectiveCatalog;
  if (!catalog) {
    effectiveCatalog = validateAgentCatalog(buildSyntheticFixtureCatalog(checkedPolicy), checkedPolicy);
  } else {
    effectiveCatalog = validateAgentCatalog(catalog, checkedPolicy);
  }

  const presenceMap = new Map();
  if (Array.isArray(presence)) {
    for (const item of presence) {
      if (item && typeof item.id === 'string') {
        presenceMap.set(item.id, item);
      }
    }
  } else if (presence && typeof presence.snapshot === 'function') {
    for (const repo of allowedRepos) {
      try {
        const snap = presence.snapshot({ memberId: requesterId, projectId: repo });
        if (Array.isArray(snap)) {
          for (const item of snap) {
            if (item && typeof item.id === 'string') {
              const existing = presenceMap.get(item.id);
              if (!existing || (existing.status !== 'online' && item.status === 'online')) {
                presenceMap.set(item.id, item);
              }
            }
          }
        }
      } catch {
        // Fallthrough if presence snapshot throws or is not accessible
      }
    }
  }

  const queueMap = new Map();
  if (Array.isArray(queues)) {
    for (const q of queues) {
      if (q && typeof q.agent_id === 'string') {
        queueMap.set(q.agent_id, q);
      }
    }
  }

  const projectedAgents = [];

  for (const agent of effectiveCatalog) {
    const visibleProjects = agent.projects.filter(repo =>
      allowedRepos.has(repo) && (projectFilter === null || repo === projectFilter)
    );

    if (visibleProjects.length === 0) continue;

    const presenceItem = presenceMap.get(agent.id);
    const rawStatus = presenceItem?.status ?? 'unknown';
    const seenAt = presenceItem?.seenAt ?? null;
    const normalizedState = normalizeStatus(rawStatus, seenAt);

    const agentQueue = queueMap.get(agent.id) ?? {
      active_task_id: null,
      assigned_count: 0,
    };

    projectedAgents.push({
      profile: {
        id: agent.id,
        owner_id: agent.ownerId,
        label: clean(agent.label, 80),
        role: clean(agent.role, 40),
        projects: visibleProjects,
      },
      provider: {
        provider_id: agent.provider.provider_id,
        provider_type: agent.provider.provider_type,
        adapter_id: agent.provider.adapter_id,
      },
      status: normalizedState,
      status_detail: {
        state: normalizedState,
        raw_presence_state: rawStatus,
        last_seen_at: seenAt,
      },
      authority_limits: {
        read_only: true,
        arbitrary_execution: false,
        allowed_projects: visibleProjects,
      },
      queue: {
        active_task_id: agentQueue.active_task_id ?? null,
        assigned_count: Number.isSafeInteger(agentQueue.assigned_count) ? agentQueue.assigned_count : 0,
      },
    });
  }

  projectedAgents.sort((a, b) => a.profile.id.localeCompare(b.profile.id));

  return {
    status: 'available',
    is_available: true,
    requester_id: requesterId,
    projected_at: typeof now === 'function' ? now() : Number(now),
    total_agents: projectedAgents.length,
    agents: projectedAgents,
  };
}

export function projectFixtureAgentStatus(policy, requesterId, options = {}) {
  const catalog = buildSyntheticFixtureCatalog(policy);
  return projectAgentStatus({
    catalog,
    policy,
    requesterId,
    ...options,
  });
}
