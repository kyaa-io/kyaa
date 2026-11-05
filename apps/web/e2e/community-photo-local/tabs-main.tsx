import { createRoot } from "react-dom/client";
import styles from "../../features/groups/ui/group-manage.module.css";
import "../../app/globals.css";
const items = ["통계", "공지", "회원", "신청", "행사", "미션", "선물", "설정"];
createRoot(document.getElementById("root")!).render(<div className={styles.content ? undefined : undefined}><nav className={styles.tabs} aria-label="manage">{items.map((l, i) => <a key={l} href="#" aria-current={i === 2 ? "page" : undefined}>{l}</a>)}</nav></div>);
