"use client";

import { Archive, PenLine, Settings, type LucideIcon } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useCallback, useRef, useState, type RefObject } from "react";

import styles from "./MemoryStarmapDock.module.css";

const BASE_ITEM_SIZE = 50;
const MAGNIFIED_ITEM_SIZE = 70;
const MAGNIFICATION_DISTANCE = 140;
const ITEM_SPRING = { damping: 12, mass: 0.1, stiffness: 150 } as const;

type DockItemId = "archive" | "record" | "settings";

type DockItemSpec = Readonly<{
  buttonRef?: RefObject<HTMLButtonElement | null>;
  icon: LucideIcon;
  id: DockItemId;
  label: string;
  onActivate: () => void;
}>;

type DockItemProps = DockItemSpec &
  Readonly<{
    isLabelVisible: boolean;
    isReducedMotion: boolean;
    mouseX: MotionValue<number>;
    onFocusChange: (id: DockItemId | null) => void;
    onHoverChange: (id: DockItemId | null) => void;
  }>;

export type MemoryStarmapDockProps = Readonly<{
  onOpenArchive: () => void;
  onOpenRecord: () => void;
  onOpenSettings: () => void;
  recordButtonRef: RefObject<HTMLButtonElement | null>;
}>;

function DockItem({
  buttonRef,
  icon: Icon,
  id,
  isLabelVisible,
  isReducedMotion,
  label,
  mouseX,
  onFocusChange,
  onHoverChange,
  onActivate,
}: DockItemProps) {
  const internalRef = useRef<HTMLButtonElement>(null);
  const setButtonRef = useCallback(
    (element: HTMLButtonElement | null): void => {
      internalRef.current = element;
      if (buttonRef !== undefined) buttonRef.current = element;
    },
    [buttonRef],
  );

  const targetSize = useTransform(mouseX, (clientX): number => {
    const bounds = internalRef.current?.getBoundingClientRect();
    if (bounds === undefined || !Number.isFinite(clientX)) return BASE_ITEM_SIZE;

    const distanceFromCenter = clientX - (bounds.left + bounds.width / 2);
    const proximity = Math.max(0, 1 - Math.abs(distanceFromCenter) / MAGNIFICATION_DISTANCE);
    return BASE_ITEM_SIZE + (MAGNIFIED_ITEM_SIZE - BASE_ITEM_SIZE) * proximity;
  });
  const animatedSize = useSpring(targetSize, ITEM_SPRING);
  const renderedSize = isReducedMotion ? BASE_ITEM_SIZE : animatedSize;

  return (
    <motion.button
      aria-haspopup="dialog"
      aria-label={label}
      className={styles.item}
      data-starmap-overlay-trigger="true"
      onBlur={() => onFocusChange(null)}
      onClick={onActivate}
      onFocus={() => onFocusChange(id)}
      onHoverEnd={() => onHoverChange(null)}
      onHoverStart={() => onHoverChange(id)}
      ref={setButtonRef}
      style={{ height: renderedSize, width: renderedSize }}
      type="button"
    >
      <Icon aria-hidden="true" className={styles.icon} size={20} strokeWidth={1.7} />
      <AnimatePresence initial={false}>
        {isLabelVisible ? (
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            aria-hidden="true"
            className={styles.label}
            exit={{ opacity: 0, y: isReducedMotion ? 0 : 3 }}
            initial={{ opacity: 0, y: isReducedMotion ? 0 : 3 }}
            style={{ x: "-50%" }}
            transition={{ duration: isReducedMotion ? 0 : 0.16 }}
          >
            {label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  );
}

export function MemoryStarmapDock({
  onOpenArchive,
  onOpenRecord,
  onOpenSettings,
  recordButtonRef,
}: MemoryStarmapDockProps) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY);
  const isReducedMotion = useReducedMotion() ?? true;
  const [focusedItemId, setFocusedItemId] = useState<DockItemId | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<DockItemId | null>(null);
  const visibleLabelId = hoveredItemId ?? focusedItemId;
  const items: readonly DockItemSpec[] = [
    {
      buttonRef: recordButtonRef,
      icon: PenLine,
      id: "record",
      label: "记录内容",
      onActivate: onOpenRecord,
    },
    {
      icon: Archive,
      id: "archive",
      label: "星星仓库",
      onActivate: onOpenArchive,
    },
    {
      icon: Settings,
      id: "settings",
      label: "设置",
      onActivate: onOpenSettings,
    },
  ];

  return (
    <nav aria-label="星空主要操作" className={styles.root}>
      <div
        className={styles.panel}
        onMouseLeave={() => {
          mouseX.set(Number.POSITIVE_INFINITY);
          setHoveredItemId(null);
        }}
        onMouseMove={(event) => {
          if (!isReducedMotion) mouseX.set(event.clientX);
        }}
      >
        {items.map((item) => (
          <DockItem
            {...item}
            isLabelVisible={visibleLabelId === item.id}
            isReducedMotion={isReducedMotion}
            key={item.id}
            mouseX={mouseX}
            onFocusChange={setFocusedItemId}
            onHoverChange={setHoveredItemId}
          />
        ))}
      </div>
    </nav>
  );
}
