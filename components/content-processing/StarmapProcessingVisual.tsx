export type StarmapProcessingVisualState = "active" | "completed" | "failed" | "waiting";

type StarmapProcessingVisualProps = Readonly<{
  className?: string;
  jobId?: string;
  state: StarmapProcessingVisualState;
  testId?: string;
}>;

export function StarmapProcessingVisual({
  className,
  jobId,
  state,
  testId,
}: StarmapProcessingVisualProps) {
  return (
    <span
      aria-hidden="true"
      className={`memory-processing-visual ${className ?? ""}`}
      data-processing-visual-state={state}
      data-task-job-id={jobId}
      data-testid={testId}
    >
      <span className="memory-record-processing-transition__black-hole memory-processing-visual__black-hole">
        <span className="memory-record-processing-transition__disc memory-processing-visual__disc" />
        <span className="memory-record-processing-transition__core memory-processing-visual__core" />
      </span>
      <span className="memory-record-processing-transition__star-core memory-processing-visual__star-core" />
    </span>
  );
}
