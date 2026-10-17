import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";


/**
 * Instagram stilində kiçik mesaj menyusu.
 * - document.body-yə "portal" ilə çəkilir, ona görə heç bir valideyn (overflow, z-index,
 *   animasiya, bottom-nav) menyunu gizlədə və ya kəsə bilmir.
 * - Yer çatmasa yuxarı açılır, ekrandan çıxmır.
 * - Kənara kliklə / Esc / scroll / resize ilə bağlanır.
 */
export default function MessageMenu({
    anchor,
    mine,
    canCopy,
    canEdit,
    onReply,
    onCopy,
    onForward,
    onEdit,
    onHideForMe,
    onUnsend,
    onClose,
}) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    const [confirming, setConfirming] = useState(false);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !anchor) return;
        const pad = 8;
        const gap = 6;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let top = anchor.bottom + gap;
        if (top + h > vh - pad) top = anchor.top - h - gap;
        if (top < pad) top = Math.max(pad, vh - h - pad);

        let left = mine ? anchor.right - w : anchor.left;
        left = Math.max(pad, Math.min(left, vw - w - pad));

        setPos({ top, left });
    }, [anchor, mine, confirming]);

    useEffect(() => {
        function onPointerDown(e) {
            if (ref.current?.contains(e.target)) return;
            if (e.target.closest?.("[data-msg-dots]")) return; // 3 nöqtənin öz klikini ayrıca idarə edir
            onClose();
        }
        function onKey(e) {
            if (e.key === "Escape") onClose();
        }
        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKey);
        window.addEventListener("resize", onClose);
        window.addEventListener("scroll", onClose, true);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKey);
            window.removeEventListener("resize", onClose);
            window.removeEventListener("scroll", onClose, true);
        };
    }, [onClose]);

    if (!anchor) return null;

    const style = pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0 };

    return createPortal(
        <div
            ref={ref}
            className={`msg-pop${pos ? "" : " is-measuring"}`}
            role="menu"
            style={style}
            onContextMenu={(e) => e.preventDefault()}
        >
            {confirming ? (
                <>
                    <div className="msg-pop-title">Mesaj hamıdan silinsin?</div>
                    <div className="msg-pop-note">Mesaj söhbətdəki hər kəs üçün silinəcək.</div>
                    <button type="button" role="menuitem" className="is-danger" onClick={onUnsend}>Hamıdan sil</button>
                    <button type="button" role="menuitem" onClick={() => setConfirming(false)}>Ləğv et</button>
                </>
            ) : (
                <>
                    <button type="button" role="menuitem" onClick={onReply}>Yanıtla</button>
                    {canCopy ? <button type="button" role="menuitem" onClick={onCopy}>Kopyala</button> : null}
                    <button type="button" role="menuitem" onClick={onForward}>İlet</button>
                    {canEdit ? <button type="button" role="menuitem" onClick={onEdit}>Düzəlt</button> : null}
                    <hr />
                    <button type="button" role="menuitem" className="is-danger" onClick={onHideForMe}>Məndən sil</button>
                    {mine ? (
                        <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirming(true)}>Hamıdan sil</button>
                    ) : null}
                </>
            )}
        </div>,
        document.body,
    );
}