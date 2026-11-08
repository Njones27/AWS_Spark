import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  ReactFlow,
  useConnection,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Connection,
  type Edge,
  type FinalConnectionState,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { ServiceChip } from '../ServiceTip';
import type { ServiceId } from '../../data/types';
import { badgesFor } from '../../engine/badges';
import { checkConnection } from '../../engine/validate';
import { useDevice } from '../../device';
import { useTheme } from '../../theme';
import { useBand } from '../../store';
import { CloudZone, TownZone } from '../art/Scenery';
import { Sparky } from '../art/Sparky';
import { Icon } from '../Icon';
import { FlowEdge } from './FlowEdge';
import {
  isPiece,
  makeEdge,
  SimContext,
  toSim,
  UiContext,
  type AppEdge,
  type AppNode,
  type Linking,
  type SimState,
  type ZoneNode,
} from './model';
import { PieceNode } from './PieceNode';

const nodeTypes = {
  piece: PieceNode,
  cloud: ({ data }: NodeProps<ZoneNode>) => <CloudZone width={data.width} height={data.height} />,
  town: ({ data }: NodeProps<ZoneNode>) => <TownZone width={data.width} height={data.height} />,
};
const edgeTypes = { flow: FlowEdge };

// Room around the map when it first fits the screen: the laptop keeps clear of the zoom buttons and the tray; a phone
// keeps clear of the mission bar along the top (one line when the phone is sideways).
const LAPTOP_FIT = { top: '16px', left: '16px', right: '64px', bottom: '120px' } as const;
const PHONE_FIT = { top: '96px', left: '8px', right: '8px', bottom: '12px' } as const;
const PHONE_WIDE_FIT = { top: '56px', left: '8px', right: '56px', bottom: '8px' } as const;

interface Bubble {
  /** The piece the tip is about. The bubble stays pinned to it, even while it is dragged or the map is panned. */
  nodeId: string;
  title: string;
  text: string;
  suggestions: ServiceId[];
}

/** Where a piece sits on screen, in pixels from the map's top-left corner. */
interface Anchor {
  x: number;
  top: number;
  bottom: number;
  width: number;
}

const sameAnchor = (a: Anchor | null, b: Anchor | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.top === b.top && a.bottom === b.bottom && a.width === b.width);

// Half the bubble's width plus a little room, so it never hangs off either side of the map.
const BUBBLE_HALF = 170;
// When the piece is this close to the top of the map, the bubble goes underneath it instead of above.
const ROOM_ABOVE = 200;

/** A tip that points at one piece and follows it around the map. */
function AnchoredBubble({ bubble, onClose }: { bubble: Bubble; onClose: () => void }) {
  const anchor = useStore((s): Anchor | null => {
    const n = s.nodeLookup.get(bubble.nodeId);
    if (!n) return null;
    const [tx, ty, zoom] = s.transform;
    const { x, y } = n.internals.positionAbsolute;
    const w = n.measured.width ?? 0;
    const h = n.measured.height ?? 0;
    return { x: (x + w / 2) * zoom + tx, top: y * zoom + ty, bottom: (y + h) * zoom + ty, width: s.width };
  }, sameAnchor);

  // The piece was deleted, so there's nothing left to point at.
  useEffect(() => {
    if (!anchor) onClose();
  }, [anchor, onClose]);
  if (!anchor) return null;

  const below = anchor.top < ROOM_ABOVE;
  const left = anchor.width > BUBBLE_HALF * 2 ? Math.min(Math.max(anchor.x, BUBBLE_HALF), anchor.width - BUBBLE_HALF) : anchor.x;
  // If the bubble had to slide sideways to stay on screen, slide its tail back so it still touches the piece.
  const tail = Math.min(Math.max(anchor.x - left, -BUBBLE_HALF + 34), BUBBLE_HALF - 34);

  return (
    <div
      className={`bubble ${below ? 'is-below' : ''}`}
      style={{ left, top: below ? anchor.bottom : anchor.top, ['--tail-x' as string]: `${tail}px` }}
      role="alert"
    >
      <div className="bubble-head">
        <Sparky mood="worried" size={46} bob={false} />
        <strong>{bubble.title}</strong>
        <button className="bubble-close" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p>{bubble.text}</p>
      {bubble.suggestions.length > 0 && (
        <div className="bubble-try">
          <span>Try connecting it to:</span>
          {bubble.suggestions.map((sid) => (
            <ServiceChip key={sid} service={sid} />
          ))}
        </div>
      )}
    </div>
  );
}

// Keep the toolbar this far from the map's edges, and flip it under the piece when the piece is near the top.
const TOOLBAR_EDGE = 8;
const TOOLBAR_ROOM_ABOVE = 76;

/**
 * Big Connect and Put back buttons above the selected piece. They stay the same size at any zoom, so they are easy to hit
 * with a thumb even when the whole map is zoomed out on a phone.
 */
function PieceToolbar({
  nodeId,
  canSend,
  canRemove,
  onConnectClick,
  onRemove,
}: {
  nodeId: string;
  canSend: boolean;
  canRemove: boolean;
  onConnectClick: () => void;
  onRemove: () => void;
}) {
  const anchor = useStore((s): Anchor | null => {
    const n = s.nodeLookup.get(nodeId);
    if (!n) return null;
    const [tx, ty, zoom] = s.transform;
    const { x, y } = n.internals.positionAbsolute;
    const w = n.measured.width ?? 0;
    const h = n.measured.height ?? 0;
    return { x: (x + w / 2) * zoom + tx, top: y * zoom + ty, bottom: (y + h) * zoom + ty, width: s.width };
  }, sameAnchor);
  const ref = useRef<HTMLDivElement>(null);
  const [half, setHalf] = useState(120);
  useLayoutEffect(() => {
    if (ref.current) setHalf(ref.current.offsetWidth / 2);
  }, [canSend, canRemove]);
  if (!anchor) return null;

  const below = anchor.top < TOOLBAR_ROOM_ABOVE;
  const left = Math.min(Math.max(anchor.x, half + TOOLBAR_EDGE), anchor.width - half - TOOLBAR_EDGE);
  const tail = Math.min(Math.max(anchor.x - left, -half + 20), half - 20);
  return (
    <div
      ref={ref}
      className={`piece-toolbar ${below ? 'is-below' : ''}`}
      style={{ left, top: below ? anchor.bottom : anchor.top, ['--tail-x' as string]: `${tail}px` }}
    >
      {canSend && (
        <button className="piece-tool piece-connect" onClick={onConnectClick}>
          <Icon name="arrow" /> Connect
        </button>
      )}
      {canRemove && (
        <button className="piece-tool piece-putback" onClick={onRemove}>
          <Icon name="close" /> Put back
        </button>
      )}
    </div>
  );
}

interface Props {
  nodes: AppNode[];
  edges: AppEdge[];
  onNodesChange: OnNodesChange<AppNode>;
  onEdgesChange: OnEdgesChange<AppEdge>;
  setEdges: Dispatch<SetStateAction<AppEdge[]>>;
  sim: SimState;
  /** Called when arrows or pieces are added or removed (not when pieces are moved). */
  onStructureChange?: () => void;
  onSelect?: (id: string | null) => void;
  /** The pieces that can be placed here (the tray plus the map). Rejection tips only suggest these. */
  available?: ServiceId[];
  /** Hides the Connect and Put back toolbar, for when something else (like the phone's open piece card) is on top. */
  hideToolbar?: boolean;
  children?: ReactNode;
}

export function BuilderCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  setEdges,
  sim,
  onStructureChange,
  onSelect,
  available,
  hideToolbar,
  children,
}: Props) {
  const band = useBand();
  const { device, sideways } = useDevice();
  const phone = device === 'phone';
  const { getNode, getNodes, getEdges, getInternalNode, deleteElements, fitView, getViewport, setViewport } = useReactFlow<
    AppNode,
    AppEdge
  >();
  const wrap = useRef<HTMLDivElement>(null);
  // Room around the map when it's fitted to the screen. On a laptop the tray along the bottom wraps onto two rows in a
  // narrow window, so leave room for however tall it really is.
  const fitPadding = useCallback(() => {
    if (sideways) return PHONE_WIDE_FIT;
    if (phone) return PHONE_FIT;
    const tray = wrap.current?.querySelector('.canvas-dock:not(.canvas-dock-right)');
    const room = tray ? Math.round(tray.getBoundingClientRect().height) + 28 : 0;
    return room > 120 ? { ...LAPTOP_FIT, bottom: `${room}px` as const } : LAPTOP_FIT;
  }, [phone, sideways]);
  const fit = useCallback((duration?: number) => fitView({ padding: fitPadding(), duration }), [fitView, fitPadding]);
  // Once the student pans or zooms the map themselves, a resize keeps their view rather than fitting the map again.
  const moved = useRef(false);

  // Turning a phone, or switching between the phone and laptop layouts, changes the map's shape completely, so fit the
  // map again.
  const layout = useRef(fitPadding);
  useEffect(() => {
    if (layout.current === fitPadding) return;
    layout.current = fitPadding;
    moved.current = false;
    const timer = window.setTimeout(() => fit(200), 150);
    return () => window.clearTimeout(timer);
  }, [fitPadding, fit]);

  // The first fit (the fitView prop) can't see the tray yet; fit once more when every piece has been measured.
  const measured = useNodesInitialized();
  const ready = useRef(false);
  useEffect(() => {
    if (!measured || ready.current) return;
    ready.current = true;
    if (!moved.current) fit();
  }, [measured, fit]);

  // When the map's box changes size (the window is resized, or a side panel is dragged or folded away) or the tray
  // wraps onto another row, keep the map in view: fit it again or, if the student has moved it, keep the same middle.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let last = { w: el.clientWidth, h: el.clientHeight };
    const observer = new ResizeObserver(() => {
      const prev = last;
      last = { w: el.clientWidth, h: el.clientHeight };
      if (!ready.current || !last.w || !last.h) return;
      if (!moved.current) {
        fit();
        return;
      }
      const vp = getViewport();
      setViewport({ x: vp.x + (last.w - prev.w) / 2, y: vp.y + (last.h - prev.h) / 2, zoom: vp.zoom });
    });
    observer.observe(el);
    const tray = el.querySelector('.canvas-dock:not(.canvas-dock-right)');
    if (tray) observer.observe(tray);
    return () => observer.disconnect();
  }, [fit, getViewport, setViewport]);

  const { theme } = useTheme();
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const closeBubble = useCallback(() => setBubble(null), []);
  const [wiggleId, setWiggleId] = useState<string | null>(null);
  const lastConnected = useRef<string | null>(null);
  const dragging = useConnection((c) => c.inProgress);
  const clicking = useStore((s) => !!s.connectionClickStartHandle);
  const badges = useMemo(() => {
    const g = toSim(nodes, edges);
    return badgesFor(g.nodes, g.edges);
  }, [nodes, edges]);

  const pieceOf = useCallback(
    (id: string) => {
      const n = getNode(id);
      return n && isPiece(n) ? { id: n.id, service: n.data.service } : undefined;
    },
    [getNode],
  );

  const isValidConnection = useCallback(
    (c: Connection | Edge) => {
      const s = pieceOf(c.source);
      const t = pieceOf(c.target);
      return !!s && !!t && checkConnection(getEdges(), s, t).ok;
    },
    [pieceOf, getEdges],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const s = pieceOf(c.source);
      const t = pieceOf(c.target);
      if (!s || !t) return;
      const edge = makeEdge(s.id, t.id, s.service, t.service);
      if (!edge) return;
      setEdges((es) => (es.some((e) => e.id === edge.id) ? es : [...es, edge]));
      lastConnected.current = edge.id;
      setBubble(null);
      onStructureChange?.();
    },
    [pieceOf, setEdges, onStructureChange],
  );

  const explainAt = useCallback(
    (targetId: string, title: string, text: string, suggestions: ServiceId[] = []) => {
      if (!getInternalNode(targetId)) return;
      setBubble({ nodeId: targetId, title, text, suggestions });
      setWiggleId(targetId);
      window.setTimeout(() => setWiggleId((w) => (w === targetId ? null : w)), 650);
    },
    [getInternalNode],
  );

  /** Explain why `fromId → toId` was refused (if it was). */
  const explainRefusal = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId || lastConnected.current === `${fromId}->${toId}`) return;
      const s = pieceOf(fromId);
      const t = pieceOf(toId);
      if (!s || !t) return;
      const check = checkConnection(getEdges(), s, t);
      if (check.ok) return;
      if (check.kind === 'duplicate') explainAt(t.id, 'Already connected!', 'There’s already an arrow between these two.');
      else if (check.kind === 'cycle')
        explainAt(
          t.id,
          'That would make a loop!',
          band === 'architect'
            ? 'This edge would create a cycle, and requests could bounce around forever. Keep the flow one-way.'
            : 'Requests would go round and round forever. Arrows should keep moving forward.',
        );
      else if (check.rejection)
        explainAt(
          t.id,
          'Hmm, those don’t fit together',
          band === 'architect' ? check.rejection.tech : check.rejection.simple,
          check.rejection.suggestions.filter((sid) => !available || available.includes(sid)).slice(0, 4),
        );
    },
    [pieceOf, getEdges, explainAt, band, available],
  );

  // Drag-to-connect: React Flow tells us where the arrow came from and (usually) where it landed.
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode) return;
      const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
      const toId =
        state.toNode?.id ??
        (pt && document.elementFromPoint(pt.clientX, pt.clientY)?.closest('.react-flow__node')?.getAttribute('data-id'));
      if (toId) explainRefusal(state.fromNode.id, toId);
    },
    [explainRefusal],
  );

  // Tap-to-connect (tablets): React Flow doesn't report the start node at the end, so remember it.
  const clickFrom = useRef<string | null>(null);
  const onClickConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const from = clickFrom.current;
      clickFrom.current = null;
      const toId = (event.target as Element | null)?.closest('.react-flow__node')?.getAttribute('data-id');
      if (from && toId) explainRefusal(from, toId);
    },
    [explainRefusal],
  );

  // ── Connect button: tap it, then tap the piece the arrow should go to ──
  const [linking, setLinking] = useState<Linking | null>(null);
  const linkingRef = useRef(linking);
  linkingRef.current = linking;

  const targetsFrom = useCallback(
    (fromId: string) => {
      const s = pieceOf(fromId);
      const targets = new Set<string>();
      if (!s) return targets;
      const es = getEdges();
      for (const n of getNodes()) {
        if (n.id === fromId || !isPiece(n)) continue;
        if (checkConnection(es, s, { id: n.id, service: n.data.service }).ok) targets.add(n.id);
      }
      return targets;
    },
    [pieceOf, getEdges, getNodes],
  );

  const pickFrom = useCallback(
    (id: string) => {
      setBubble(null);
      setLinking({ from: id, targets: targetsFrom(id) });
    },
    [targetsFrom],
  );
  const stopLinking = useCallback(() => setLinking(null), []);

  /** Draw the arrow if it fits, or explain why it doesn't. */
  const connectTo = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      lastConnected.current = null;
      const c = { source: fromId, target: toId, sourceHandle: null, targetHandle: null };
      if (isValidConnection(c)) onConnect(c);
      else explainRefusal(fromId, toId);
    },
    [isValidConnection, onConnect, explainRefusal],
  );

  // Escape puts the Connect button down.
  useEffect(() => {
    if (!linking) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stopLinking();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linking, stopLinking]);

  const ui = useMemo(() => ({ wiggleId, badges, linking }), [wiggleId, badges, linking]);
  const chosen = nodes.filter((n) => n.selected);
  const tooled = chosen.length === 1 && isPiece(chosen[0]) ? chosen[0] : null;

  return (
    <SimContext.Provider value={sim}>
      <UiContext.Provider value={ui}>
        <div ref={wrap} className={`canvas ${dragging || clicking ? 'is-connecting' : ''} ${linking ? 'is-linking' : ''} ${sim.running ? 'is-running' : ''}`}>
          <ReactFlow<AppNode, AppEdge>
            colorMode={theme}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onConnectStart={() => (lastConnected.current = null)}
            onConnectEnd={onConnectEnd}
            onClickConnectStart={(_, { nodeId }) => {
              lastConnected.current = null;
              clickFrom.current = nodeId;
            }}
            onClickConnectEnd={onClickConnectEnd}
            onNodeClick={(_, n) => {
              if (!isPiece(n)) return;
              // While picking a target the starting piece stays selected, so its Connect button comes back for the next arrow.
              const from = linkingRef.current?.from;
              if (from) {
                stopLinking();
                if (from !== n.id) connectTo(from, n.id);
                return;
              }
              setBubble(null);
              onSelect?.(n.id);
            }}
            onPaneClick={() => {
              onSelect?.(null);
              setBubble(null);
              stopLinking();
            }}
            onNodesDelete={() => onStructureChange?.()}
            onEdgesDelete={() => onStructureChange?.()}
            onMoveStart={(event) => {
              // Only the student's own drags, scrolls and pinches carry an event; fitting the map doesn't.
              if (event) moved.current = true;
            }}
            fitView
            fitViewOptions={{ padding: sideways ? PHONE_WIDE_FIT : phone ? PHONE_FIT : LAPTOP_FIT }}
            minZoom={0.3}
            maxZoom={1.8}
            connectionRadius={44}
            panOnScroll
            selectNodesOnDrag={false}
            elementsSelectable={!linking}
            elevateEdgesOnSelect
            deleteKeyCode={['Backspace', 'Delete']}
          >
            <Background variant={BackgroundVariant.Dots} gap={28} size={2.2} color="#e2d7c3" />
            <Controls
              showInteractive={false}
              showFitView={false}
              position="top-right"
              onZoomIn={() => (moved.current = true)}
              onZoomOut={() => (moved.current = true)}
            >
              <ControlButton
                className="react-flow__controls-fitview"
                title="Fit the whole map on screen"
                aria-label="Fit the whole map on screen"
                onClick={() => {
                  moved.current = false;
                  fit(200);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden="true">
                  <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
                </svg>
              </ControlButton>
            </Controls>
          </ReactFlow>
          {/* Hidden while Sparky's tip is open, so the two never cover each other. */}
          {tooled && !linking && !bubble && !hideToolbar && (tooled.data.service !== 'phone' || !tooled.data.locked) && (
            <PieceToolbar
              key={tooled.id}
              nodeId={tooled.id}
              canSend={tooled.data.service !== 'phone'}
              canRemove={!tooled.data.locked}
              onConnectClick={() => pickFrom(tooled.id)}
              onRemove={() => {
                setBubble(null);
                deleteElements({ nodes: [{ id: tooled.id }] });
              }}
            />
          )}
          {bubble && <AnchoredBubble bubble={bubble} onClose={closeBubble} />}
          {children}
        </div>
      </UiContext.Provider>
    </SimContext.Provider>
  );
}

