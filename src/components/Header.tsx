import type { MouseEvent } from "react";

import { useBackend } from "../backend/context";
import { useStore } from "../store/useStore";
import { Icon } from "./Icon";

const PRODUCT_SITE = "https://utilsware.com";
const PRODUCT_SITE_DOC = "https://utilsware.com/products/minimage";

export function Header({
  onAddFiles,
  onAddFolder,
}: {
  onAddFiles: () => void;
  onAddFolder: () => void;
}) {
  const backend = useBackend();
  const mode = useStore((s) => s.mode);
  const toggleMode = useStore((s) => s.toggleMode);

  const openSite = (e: MouseEvent) => {
    e.preventDefault();
    void backend.openUrl(PRODUCT_SITE);
  };

  return (
    <header className="header">
      <div className="brand">
        <div className="brand__mark">
          {/* Same artwork as the app icon / favicon, so the logo always matches. */}
          <img src="/favicon.svg" alt="Minimage" width={30} height={30} />
        </div>
        <div>
          <div className="brand__name">
            Min<span className="brand__name-accent">image</span>
          </div>
          <a
            className="brand__tag brand__tag--link"
            href={PRODUCT_SITE}
            onClick={openSite}
            title="A Utilsware product"
          >
            by Utilsware
          </a>
        </div>
      </div>

      <div className="header__actions">
        <a
          className="btn btn--ghost btn--sm"
          href={PRODUCT_SITE_DOC}
          onClick={openSite}
          title="Open utilsware.com"
        >
          <Icon name="external" size={14} />
          utilsware.com
        </a>
        <button className="btn btn--subtle" onClick={onAddFolder}>
          <Icon name="folderPlus" size={16} />
          Add folder
        </button>
        <button className="btn btn--primary" onClick={onAddFiles}>
          <Icon name="plus" size={16} />
          Add images
        </button>
        <button
          className="iconbtn"
          title="Toggle light / dark"
          aria-label="Toggle light or dark theme"
          onClick={toggleMode}
        >
          <Icon name={mode === "dark" ? "sun" : "moon"} size={18} />
        </button>
      </div>
    </header>
  );
}
