import React, { ReactNode, useRef } from "react";
import {
  animate,
  motion,
  MotionValue,
  useMotionValue,
  useTransform,
} from "motion/react";

/**
 * A physics-driven swipe deck.
 *
 * Four things separate this from the first version, all of which were what
 * made it feel "not quite smooth":
 *
 * 1. **The card pivots from the finger, not its centre.** Grab a photograph by
 *    its top-left corner and drag right: it swings from that corner. Rotating
 *    about the centre regardless of where the touch landed is what makes a
 *    card feel disconnected from the hand holding it.
 *
 * 2. **Release velocity carries into the animation.** A time-based exit throws
 *    a gentle nudge and a hard flick off-screen at exactly the same speed,
 *    which breaks the illusion at the precise moment the user is paying most
 *    attention. The spring is seeded with the velocity the finger actually had.
 *
 * 3. **Thresholds are proportional.** 90 fixed pixels is a flick on a tablet
 *    and a shove on a small phone.
 *
 * 4. **Three cards, not one.** The next two are rendered behind, and the one
 *    underneath rises toward full size as the top card travels — so the stack
 *    has depth and nothing pops into existence on commit.
 */

export type SwipeDir = "left" | "right" | "up";

/** Fraction of card width a slow drag must cross. */
const COMMIT_FRACTION = 0.32;
/** A fast flick commits earlier, but still has to mean it. */
const FLICK_VELOCITY = 550;
const FLICK_MIN_FRACTION = 0.12;
/** Degrees at full deflection. */
const MAX_ROTATION = 16;

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onCommit: (item: T, dir: SwipeDir) => void;
  /** Enables the third direction. */
  allowUp?: boolean;
  /** Overlay stamps, faded in by drag distance. */
  overlay?: (dir: SwipeDir) => ReactNode;
  /** Tailwind background for the wash behind each direction. */
  tint?: Partial<Record<SwipeDir, string>>;
  /** Fired on release below threshold, for a sound cue. */
  onSettle?: () => void;
  /** Freezes the top card. The stack still renders — it is showing you who is
   *  up next — but it cannot be dragged, so an accidental brush of the screen
   *  cannot commit anything. */
  disabled?: boolean;
  className?: string;
}

export function SwipeDeck<T>({
  items,
  keyOf,
  renderItem,
  onCommit,
  allowUp = false,
  overlay,
  tint,
  onSettle,
  disabled = false,
  className = "",
}: Props<T>) {
  // Shared so the cards behind can react to the top card's travel.
  const progress = useMotionValue(0);
  const visible = items.slice(0, 3);

  return (
    <div className={`relative select-none ${className}`}>
      {/* Painted back to front so the top card ends up on top without z-index
          juggling. */}
      {visible
        .map((item, depth) => ({ item, depth }))
        .reverse()
        .map(({ item, depth }) =>
          depth === 0 ? (
            <TopCard
              key={keyOf(item)}
              progress={progress}
              allowUp={allowUp}
              overlay={overlay}
              tint={tint}
              onSettle={onSettle}
              disabled={disabled}
              onCommit={(dir) => onCommit(item, dir)}
            >
              {renderItem(item)}
            </TopCard>
          ) : (
            <BackingCard key={keyOf(item)} depth={depth} progress={progress}>
              {renderItem(item)}
            </BackingCard>
          )
        )}
    </div>
  );
}

/**
 * A card behind the top one. It scales and rises toward the front as the top
 * card is dragged away, so promotion is already half-complete by the time the
 * commit lands.
 */
function BackingCard({
  depth,
  progress,
  children,
}: {
  depth: number;
  progress: MotionValue<number>;
  children: ReactNode;
}) {
  const restScale = 1 - depth * 0.05;
  const restY = depth * 10;

  const scale = useTransform(progress, [0, 1], [restScale, restScale + 0.05]);
  const y = useTransform(progress, [0, 1], [restY, restY - 10]);
  const opacity = useTransform(progress, [0, 1], [1 - depth * 0.25, 1 - (depth - 1) * 0.25]);

  return (
    <motion.div
      style={{ scale, y, opacity, willChange: "transform" }}
      className="absolute inset-0 rounded-3xl bg-white border-2 border-slate-200 shadow-md overflow-hidden pointer-events-none"
    >
      {children}
    </motion.div>
  );
}

function TopCard({
  progress,
  allowUp,
  overlay,
  tint,
  onCommit,
  onSettle,
  disabled,
  children,
}: {
  progress: MotionValue<number>;
  allowUp: boolean;
  overlay?: (dir: SwipeDir) => ReactNode;
  tint?: Partial<Record<SwipeDir, string>>;
  onCommit: (dir: SwipeDir) => void;
  onSettle?: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const ref = useRef<HTMLDivElement>(null);
  const leaving = useRef(false);

  const width = () => ref.current?.offsetWidth ?? 320;

  const rotate = useTransform(x, [-320, 320], [-MAX_ROTATION, MAX_ROTATION]);

  // Stamps reach full opacity exactly at the commit threshold, so the card
  // tells you what releasing will do before you release.
  const commitAt = () => width() * COMMIT_FRACTION;
  const rightStamp = useTransform(x, [16, 320 * COMMIT_FRACTION], [0, 1]);
  const leftStamp = useTransform(x, [-320 * COMMIT_FRACTION, -16], [1, 0]);
  const upStamp = useTransform(y, [-320 * COMMIT_FRACTION, -16], [1, 0]);

  const rightTint = useTransform(x, [0, 320 * COMMIT_FRACTION * 1.4], [0, 0.5]);
  const leftTint = useTransform(x, [-320 * COMMIT_FRACTION * 1.4, 0], [0.5, 0]);
  const upTint = useTransform(y, [-320 * COMMIT_FRACTION * 1.4, 0], [0.5, 0]);

  /**
   * Move the rotation pivot to wherever the finger landed.
   *
   * On iOS this needs the layer's position compensating, because the frame is
   * derived from the anchor point and it jumps the moment you change it. In the
   * DOM there is no such coupling, and the transform is identity at touch-down
   * anyway, so setting the origin here is visually free.
   */
  const anchorToPointer = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || leaving.current) return;
    // Only while the card is at rest; re-anchoring mid-flight would jump.
    if (Math.abs(x.get()) > 1 || Math.abs(y.get()) > 1) return;

    const rect = el.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.transformOrigin = `${px.toFixed(1)}% ${py.toFixed(1)}%`;
  };

  const fly = (dir: SwipeDir, velocity: { x: number; y: number }) => {
    if (leaving.current) return;
    leaving.current = true;

    const w = window.innerWidth;
    const h = window.innerHeight;
    // restDelta is deliberately coarse: the card is far off-screen by then, so
    // waiting for it to settle to the pixel just delays the next question.
    const spring = { type: "spring" as const, stiffness: 320, damping: 40, restDelta: 40 };

    if (dir === "up") {
      animate(x, x.get(), { duration: 0.2 });
      animate(y, -h * 1.1, { ...spring, velocity: velocity.y, onComplete: () => onCommit("up") });
      return;
    }

    animate(y, y.get() + 60, { ...spring, velocity: velocity.y });
    animate(x, (dir === "right" ? 1.15 : -1.15) * w, {
      ...spring,
      // The card leaves at the speed it was actually thrown.
      velocity: velocity.x,
      onComplete: () => onCommit(dir),
    });
  };

  const settle = (velocity: { x: number; y: number }) => {
    onSettle?.();
    const spring = { type: "spring" as const, stiffness: 460, damping: 34 };
    animate(x, 0, { ...spring, velocity: velocity.x });
    animate(y, 0, { ...spring, velocity: velocity.y });
  };

  return (
    <motion.div
      ref={ref}
      drag={!disabled}
      dragMomentum={false}
      dragElastic={0.85}
      onPointerDown={anchorToPointer}
      onDrag={() => {
        const travel = Math.max(Math.abs(x.get()), Math.abs(Math.min(0, y.get())));
        progress.set(Math.min(1, travel / Math.max(1, commitAt())));
      }}
      onDragEnd={(_, info) => {
        const { offset, velocity } = info;
        const threshold = commitAt();
        const flickMin = width() * FLICK_MIN_FRACTION;

        const far = (d: number) => Math.abs(d) > threshold;
        const flicked = (d: number, v: number) =>
          Math.abs(v) > FLICK_VELOCITY && Math.abs(d) > flickMin;

        const vertical = Math.abs(offset.y) > Math.abs(offset.x);

        if (allowUp && vertical && offset.y < 0 && (far(offset.y) || flicked(offset.y, velocity.y))) {
          fly("up", velocity);
        } else if (offset.x > 0 && (far(offset.x) || flicked(offset.x, velocity.x))) {
          fly("right", velocity);
        } else if (offset.x < 0 && (far(offset.x) || flicked(offset.x, velocity.x))) {
          fly("left", velocity);
        } else {
          settle(velocity);
          progress.set(0);
        }
      }}
      style={{
        x,
        y,
        rotate,
        // Both axes are needed when up commits something; otherwise let the
        // page scroll vertically through the card. Frozen, the card claims no
        // gestures at all, so the page scrolls straight through it.
        touchAction: disabled ? "auto" : allowUp ? "none" : "pan-y",
        willChange: "transform",
      }}
      initial={{ scale: 0.97, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className={`absolute inset-0 rounded-3xl bg-white border-2 border-slate-200 shadow-lg overflow-hidden ${
        disabled ? "" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      {tint?.right && (
        <motion.div style={{ opacity: rightTint }} className={`absolute inset-0 pointer-events-none ${tint.right}`} />
      )}
      {tint?.left && (
        <motion.div style={{ opacity: leftTint }} className={`absolute inset-0 pointer-events-none ${tint.left}`} />
      )}
      {allowUp && tint?.up && (
        <motion.div style={{ opacity: upTint }} className={`absolute inset-0 pointer-events-none ${tint.up}`} />
      )}

      {overlay && (
        <>
          <motion.div style={{ opacity: rightStamp }} className="absolute top-5 left-5 pointer-events-none z-10">
            {overlay("right")}
          </motion.div>
          <motion.div style={{ opacity: leftStamp }} className="absolute top-5 right-5 pointer-events-none z-10">
            {overlay("left")}
          </motion.div>
          {allowUp && (
            <motion.div
              style={{ opacity: upStamp }}
              className="absolute bottom-14 left-1/2 -translate-x-1/2 pointer-events-none z-10"
            >
              {overlay("up")}
            </motion.div>
          )}
        </>
      )}

      {children}
    </motion.div>
  );
}
