/**
 * AsyncSection — every view routes its main data through this so loading, empty and
 * error+retry states are consistent and announced correctly.
 */

import type { ReactNode } from "react";

export interface AsyncSectionProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loadingLabel?: string;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  children: ReactNode;
}

export function AsyncSection(props: AsyncSectionProps) {
  if (props.loading) {
    return (
      <p className="loading" role="status">
        <span aria-hidden="true">… </span>
        {props.loadingLabel ?? "Loading…"}
      </p>
    );
  }

  if (props.error) {
    return (
      <div className="error-panel" role="alert">
        <p>
          <strong>Could not load this section.</strong> {props.error}
        </p>
        <button type="button" className="btn" onClick={props.onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (props.isEmpty) {
    return (
      <div className="empty-state">
        <h2>{props.emptyTitle ?? "Nothing here yet"}</h2>
        {props.emptyMessage ? <p>{props.emptyMessage}</p> : null}
        {props.emptyAction}
      </div>
    );
  }

  return <>{props.children}</>;
}
