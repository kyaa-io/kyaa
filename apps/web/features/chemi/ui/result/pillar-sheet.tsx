"use client";

/**
 * 명식표(사주 여덟 글자). 시·일·월·연 4열 × 천간·지지, 위아래에 십신, 한자 크게 + 한글 읽기 + 오행 그림.
 * 일주 열(나)은 선 하나로 구분한다. 모르는 기둥은 자물쇠 자리표시로 높이를 지킨다.
 * '자세히'를 펼치면 같은 표 아래에 지장간·12운성·12신살 줄이 붙는다(주소는 바뀌지 않는다).
 */
import { Droplet, Flame, Gem, LockKeyhole, Mountain, Sprout } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanHanja } from "@/components/fan-ui/fan-hanja";
import { FanText } from "@/components/fan-ui/fan-text";
import styles from "./pillar-sheet.module.css";

export type PillarElement = "wood" | "fire" | "earth" | "metal" | "water";
const elementIcon = { wood: Sprout, fire: Flame, earth: Mountain, metal: Gem, water: Droplet } as const;
const elementName: Record<PillarElement, string> = { wood: "나무", fire: "불", earth: "흙", metal: "쇠", water: "물" };

type Cell = { letter: string; hanja: string; element: PillarElement };
export type PillarColumn =
  | { key: string; name: string; known: false }
  | {
      key: string;
      name: string;
      known: true;
      me: boolean;
      stemGod: string;
      branchGod: string;
      stem: Cell;
      branch: Cell;
      hidden: readonly string[];
      lifeStage: string | null;
      spirit: string | null;
    };

const rowNames = ["십신", "천간", "지지", "십신"] as const;
const detailNames = ["지장간", "12운성", "12신살"] as const;

function Glyph({ cell }: { cell: Cell }) {
  return (
    <span className={styles.glyph}>
      <FanHanja role="glyph">{cell.hanja}</FanHanja>
      <span className={styles.read}>
        <FanText role="label">{cell.letter}</FanText>
        <FanIcon icon={elementIcon[cell.element]} size={16} />
        <FanText role="meta">{elementName[cell.element]}</FanText>
      </span>
    </span>
  );
}

export function PillarSheet({
  columns,
  label,
  open,
  unknownLabel,
}: {
  columns: readonly PillarColumn[];
  /** 표 전체를 읽어 주는 이름(사주 여덟 글자. 시주 …) */
  label: string;
  /** '자세히' 펼침 */
  open: boolean;
  /** 모르는 기둥 칸의 읽기 이름 */
  unknownLabel: string;
}) {
  const showSpirit = columns.some((column) => column.known && column.spirit);
  const detailRows = open ? (showSpirit ? detailNames : detailNames.slice(0, 2)) : [];
  return (
    <div className={styles.sheet} role="img" aria-label={label} data-open={open || undefined} data-rows={5 + detailRows.length}>
      <div className={styles.col} aria-hidden="true">
        <span />
        {[...rowNames, ...detailRows].map((name, i) => (
          <FanText role="meta" className={styles.rowName} key={`${name}${i}`}>
            {name}
          </FanText>
        ))}
      </div>
      {columns.map((column) =>
        column.known ? (
          <div className={styles.col} data-me={column.me || undefined} key={column.key} aria-hidden="true">
            <FanText role={column.me ? "label" : "meta"} className={styles.name}>
              {column.name}
            </FanText>
            <FanText role={column.me ? "label" : "meta"} className={styles.god}>
              {column.stemGod}
            </FanText>
            <Glyph cell={column.stem} />
            <Glyph cell={column.branch} />
            <FanText role="meta" className={styles.god}>
              {column.branchGod}
            </FanText>
            {open && (
              <>
                <FanText role="body" className={styles.hidden}>
                  <FanHanja role="inline">{column.hidden.slice(0, -1).join("")}</FanHanja>
                  <FanHanja role="inline" className={styles.main}>
                    {column.hidden.at(-1)}
                  </FanHanja>
                </FanText>
                <FanText role="meta" className={styles.god}>
                  {column.lifeStage ?? ""}
                </FanText>
                {showSpirit && (
                  <FanText role="meta" className={styles.god}>
                    {column.spirit ?? ""}
                  </FanText>
                )}
              </>
            )}
          </div>
        ) : (
          <div className={styles.col} data-unknown="" key={column.key} aria-hidden="true">
            <FanText role="meta" className={styles.name}>
              {column.name}
            </FanText>
            <span className={styles.slot} title={unknownLabel}>
              <FanIcon icon={LockKeyhole} size={16} />
            </span>
          </div>
        ),
      )}
    </div>
  );
}
