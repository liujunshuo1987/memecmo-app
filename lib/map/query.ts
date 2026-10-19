// Queries over the public business map for the member page, the connector's get_map tool
// and the REST face. Pure functions over the generated module; no database, no secrets.

import { MAP_VIEW } from '@/lib/map/public-view';

export const MAP_PAGE_URL = 'https://app.memecmo.ai/map';
export const MAP_WORLDS = ['commercial', 'operation', 'measurement', 'rules', 'foundations'] as const;

type Node = { id: string; type: string; name?: { zh?: string; en?: string }; desc?: { zh?: string; en?: string }; status?: string; attrs?: Record<string, unknown> };
type Link = { from: string; type: string; to: string; note?: string };

export interface MapQuery {
  /** Focus on one object: its neighbourhood up to `depth` hops (1 or 2). */
  id?: string;
  depth?: number;
  /** Or restrict to one world / one object type. */
  world?: string;
  type?: string;
}

const graph = MAP_VIEW.graph as unknown as { nodes: Node[]; links: Link[]; classes: Record<string, { zh?: string; desc?: string; world?: string }>; link_types: Record<string, { zh?: string; en?: string; reverse?: string }>; worlds: Record<string, string> };
const byId = new Map(graph.nodes.map((n) => [n.id, n]));
const worldOf = (type: string) => graph.classes[type]?.world ?? 'foundations';

const compact = (n: Node) => ({ id: n.id, type: n.type, world: worldOf(n.type), name: n.name, desc: n.desc, status: n.status ?? 'live', ...(n.attrs && Object.keys(n.attrs).length ? { attrs: n.attrs } : {}) });

/** One payload for every caller. Unknown ids / worlds / types return an error field, never a throw. */
export function queryMap(q: MapQuery = {}): Record<string, unknown> {
  const meta = { source: 'MemeCMO business ontology map (public view)', version: MAP_VIEW.version, as_of: MAP_VIEW.as_of, page: MAP_PAGE_URL, objects: MAP_VIEW.objects, links: MAP_VIEW.links,
    note: 'Public objects only. Ids are stable and are the shared vocabulary; cite them (e.g. loop.measure_enter_prove) when talking about where something sits in MemeCMO.' };
  let keep: Set<string>;
  if (q.id) {
    const start = byId.get(q.id);
    if (!start) return { ...meta, error: `Unknown object id "${q.id}". Use get_map without arguments, or with world / type, to list ids.` };
    const depth = Math.max(1, Math.min(Number(q.depth ?? 1), 2));
    keep = new Set([start.id]);
    let frontier = [start.id];
    for (let i = 0; i < depth; i++) {
      const next: string[] = [];
      for (const l of graph.links) {
        if (frontier.includes(l.from) && !keep.has(l.to)) { keep.add(l.to); next.push(l.to); }
        if (frontier.includes(l.to) && !keep.has(l.from)) { keep.add(l.from); next.push(l.from); }
      }
      frontier = next;
    }
    const focusLinks = graph.links.filter((l) => l.from === start.id || l.to === start.id).map((l) => {
      const out = l.from === start.id; const lt = graph.link_types[l.type] ?? {};
      return { direction: out ? 'out' : 'in', type: l.type, label: out ? (lt.zh ?? l.type) : (lt.reverse ?? `← ${l.type}`), other: out ? l.to : l.from, ...(l.note ? { note: l.note } : {}) };
    });
    return { ...meta, focus: { ...compact(start), reflections: focusLinks }, depth,
      nodes: graph.nodes.filter((n) => keep.has(n.id)).map(compact), links: graph.links.filter((l) => keep.has(l.from) && keep.has(l.to)) };
  }
  if (q.world && !graph.worlds[q.world]) return { ...meta, error: `Unknown world "${q.world}". Worlds: ${Object.keys(graph.worlds).join(', ')}.` };
  if (q.type && !graph.classes[q.type]) return { ...meta, error: `Unknown type "${q.type}". Types: ${Object.keys(graph.classes).join(', ')}.` };
  const nodes = graph.nodes.filter((n) => (!q.world || worldOf(n.type) === q.world) && (!q.type || n.type === q.type));
  keep = new Set(nodes.map((n) => n.id));
  const filtered = !!(q.world || q.type);
  return { ...meta, ...(filtered ? { filter: { world: q.world, type: q.type } } : {}),
    nodes: nodes.map(compact), links: graph.links.filter((l) => keep.has(l.from) && keep.has(l.to)),
    ...(filtered ? {} : { vocabulary: { worlds: graph.worlds, types: graph.classes, link_types: graph.link_types } }) };
}
