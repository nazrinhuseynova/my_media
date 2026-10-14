export function FeedSkeleton() {
  return (
    <div className="skel-feed" aria-hidden="true">
      {[0, 1].map((row) => (
        <article key={row} className="skel-card">
          <div className="skel-row">
            <span className="skel skel-avatar" />
            <span className="skel skel-line" />
          </div>
          <span className="skel skel-media" />
          <span className="skel skel-line skel-line-short" />
        </article>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="page skel-profile" aria-hidden="true">
      <div className="skel-row">
        <span className="skel skel-avatar skel-avatar-lg" />
        <div className="skel-col">
          <span className="skel skel-line" />
          <span className="skel skel-line skel-line-short" />
        </div>
      </div>
      <div className="skel-grid">
        {[0, 1, 2, 3, 4, 5].map((tile) => <span key={tile} className="skel skel-tile" />)}
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="skel-list" aria-hidden="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="skel-row">
          <span className="skel skel-avatar" />
          <span className="skel skel-line" />
        </div>
      ))}
    </div>
  );
}
