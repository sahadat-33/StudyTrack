import { Guidelines } from './parts';

export function ContentGuidelinesPage() {
  return (
    <div className="space-y-6 rounded-xl border bg-card p-6 text-card-foreground">
      <div>
        <h2 className="text-xl font-semibold">Language that keeps the plan clear</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Short, specific labels help students decide what to do next without
          overstating progress or certainty.
        </p>
      </div>
      <Guidelines
        items={[
          {
            kind: 'do',
            text: 'Use direct reasons such as “revision overdue” or “exam in three days.”',
          },
          {
            kind: 'do',
            text: 'Label planning assumptions as estimated and confirmed dates by their source.',
          },
          {
            kind: 'do',
            text: 'Explain what each metric measures and show “Not available” when there is no data.',
          },
          {
            kind: 'dont',
            text: 'Use shame or streak warnings to describe a missed study day.',
          },
          {
            kind: 'dont',
            text: 'Present estimates, sample values, or incomplete records as confirmed facts.',
          },
        ]}
      />
    </div>
  );
}
