export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <div className="skeleton h-4 w-1/3" />
      <div className="skeleton h-3 w-2/3" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  );
}
