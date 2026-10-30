import { EdgeLabelRenderer, getBezierPath, useInternalNode, useReactFlow, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';
import { floatingParams, useSim, type AppEdge } from './model';

const DOT_SECONDS = 1.8;
const dotCount = (flow: number) => (flow <= 0.05 ? 0 : Math.min(9, Math.max(3, Math.round(3 + flow / 25))));

function Dots({ path, n, cls }: { path: string; n: number; cls: string }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <circle key={`${n}-${i}`} className={cls} r={cls === 'dot-bot' ? 6.5 : 6}>
          <animateMotion dur={`${DOT_SECONDS}s`} begin={`${-(i * DOT_SECONDS) / n}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
    </>
  );
}

function FlowEdgeView({ id, source, target, data, selected, markerEnd }: EdgeProps<AppEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const { result, running } = useSim();
  const { deleteElements } = useReactFlow();
  if (!s || !t) return null;

  const { sx, sy, tx, ty, sourcePos, targetPos } = floatingParams(s, t);
  const [path, lx, ly] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition: sourcePos, targetX: tx, targetY: ty, targetPosition: targetPos });
  const kind = data?.kind ?? 'data';
  const flow = result?.edges[id];
  const idle = running && kind === 'data' && (!flow || flow.flow + flow.bots < 0.05);

  return (
    <>
      <path d={path} className={`edge-under kind-${kind}`} />
      <path d={path} className={`edge-dash kind-${kind} ${running ? 'is-running' : ''} ${idle ? 'is-idle' : ''}`} markerEnd={markerEnd} />
      <path d={path} className="edge-hit" />
      {flow && <Dots path={path} n={dotCount(flow.flow)} cls="dot" />}
      {flow && <Dots path={path} n={dotCount(flow.bots)} cls="dot-bot" />}
      {selected && (
        <EdgeLabelRenderer>
          <div className="edge-tools nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}>
            <span className="edge-verb">{data?.verb}</span>
            <button
              className="edge-cut"
              aria-label="Cut this arrow"
              title="Cut this arrow"
              onClick={() => deleteElements({ edges: [{ id }] })}
            >
              ✂️
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeView);
