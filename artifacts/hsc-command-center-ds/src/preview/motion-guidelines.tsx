import { Guidelines } from './parts';

export function MotionGuidelinesPage() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <div>
        <h2 className="text-xl font-semibold">Motion with a purpose</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Feedback should make an action easier to understand, not compete with
          study content.
        </p>
      </div>
      <Guidelines
        items={[
          {
            kind: 'do',
            text: 'Use brief transitions to confirm saved changes or completed tasks.',
          },
          {
            kind: 'do',
            text: 'Honor the device reduced-motion preference.',
          },
          {
            kind: 'dont',
            text: 'Use looping, attention-seeking, or decorative animation in study flows.',
          },
        ]}
      />
    </div>
  );
}
