import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Guidelines } from './parts';

const CORE_SWATCHES = [
  { name: 'Primary · navy', className: 'bg-primary' },
  { name: 'Secondary · teal tint', className: 'bg-secondary' },
  { name: 'Accent · amber tint', className: 'bg-accent' },
] as const;

const SUPPORTING_SWATCHES = [
  { name: 'Background', className: 'border bg-background' },
  { name: 'Foreground', className: 'bg-foreground' },
  { name: 'Muted', className: 'bg-muted' },
  { name: 'Destructive', className: 'bg-destructive' },
  { name: 'Border', className: 'bg-border' },
] as const;

const TYPE_SCALE = [
  { label: 'Display', className: 'text-4xl font-bold' },
  { label: 'Heading', className: 'text-2xl font-semibold' },
  { label: 'Body', className: 'text-base' },
  { label: 'Label', className: 'text-sm font-medium' },
  { label: 'Caption', className: 'text-sm text-muted-foreground' },
] as const;

const SPACING_SCALE = [
  { label: '4', className: 'w-4' },
  { label: '8', className: 'w-8' },
  { label: '12', className: 'w-12' },
  { label: '16', className: 'w-16' },
  { label: '24', className: 'w-24' },
] as const;

function Swatch({
  name,
  className,
}: {
  name: string;
  className: string;
}) {
  return (
    <div className="space-y-2">
      <div className={`h-16 rounded-lg ${className}`} />
      <p className="text-sm font-medium">{name}</p>
    </div>
  );
}

export function OverviewPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Design principles
        </h2>
        <div className="mt-4">
          <Guidelines
            items={[
              {
                kind: 'do',
                text: 'Keep the home view compact; put detailed tracking on focused pages.',
              },
              {
                kind: 'do',
                text: 'Use navy for primary actions, teal for progress, and amber sparingly for attention.',
              },
              {
                kind: 'do',
                text: 'Pair status color with a clear label or icon so meaning never depends on color alone.',
              },
              {
                kind: 'dont',
                text: 'Combine chapter coverage, practice accuracy, confidence, and revision into one score.',
              },
              {
                kind: 'dont',
                text: 'Use decorative gradients or charts where a direct label is clearer.',
              },
            ]}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Core palette
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {CORE_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 text-card-foreground">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Typography
          </h2>
          <div className="mt-4 space-y-3">
            {TYPE_SCALE.map((entry) => (
              <p key={entry.label} className={entry.className}>
                {entry.label}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 text-card-foreground">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            In use
          </h2>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Today, in focus</CardTitle>
              <CardDescription>
                Example composition only — not saved study data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="overview-name">Daily study target</Label>
                <Input id="overview-name" placeholder="2 hours" />
              </div>
              <div className="flex items-center gap-2">
                <Switch defaultChecked id="overview-notify" />
                <Label htmlFor="overview-notify">Show completed tasks</Label>
                <Badge className="ml-auto" variant="secondary">
                  Example
                </Badge>
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button>Save plan</Button>
              <Button variant="outline">Adjust later</Button>
            </CardFooter>
          </Card>
        </section>
      </div>

      <section className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Components
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Badge>Badge</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </section>
    </div>
  );
}

export function ColorsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Brand colors</h2>
          <p className="text-sm text-muted-foreground">
            Navy anchors primary actions, teal supports progress, and a warm amber
            tint is reserved for occasional emphasis.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {CORE_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold">Semantic and surface colors</h2>
          <p className="text-sm text-muted-foreground">
            Roles for text, backgrounds, borders, muted content, and danger.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {SUPPORTING_SWATCHES.map((swatch) => (
            <Swatch key={swatch.name} {...swatch} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function FontsPage() {
  return (
    <div className="space-y-8 rounded-xl border bg-card p-6 text-card-foreground">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Font family
        </h2>
        <p className="mt-4 text-4xl font-bold">The quick brown fox</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The token font family is applied across this entire preview.
        </p>
      </section>

      <section className="space-y-4 border-t pt-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Type scale
        </h2>
        {TYPE_SCALE.map((entry) => (
          <div key={entry.label} className="grid gap-2 sm:grid-cols-[88px_1fr]">
            <span className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {entry.label}
            </span>
            <p className={entry.className}>Build products people understand.</p>
          </div>
        ))}
      </section>
    </div>
  );
}

export function LayoutPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="font-semibold">Spacing</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The spacing scale, derived from the base spacing token.
        </p>
        <div className="mt-6 space-y-4">
          {SPACING_SCALE.map((space) => (
            <div key={space.label} className="flex items-center gap-4">
              <span className="w-8 text-xs text-muted-foreground">
                {space.label}
              </span>
              <div className={`h-3 rounded-full bg-primary ${space.className}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-6 text-card-foreground">
        <h2 className="font-semibold">Radius</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Corner treatments derive from the base radius token.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4">
          {[
            { label: 'Small', className: 'rounded-sm' },
            { label: 'Medium', className: 'rounded-md' },
            { label: 'Large', className: 'rounded-lg' },
            { label: 'Extra large', className: 'rounded-xl' },
          ].map((radius) => (
            <div
              key={radius.label}
              className={`flex h-24 items-end border bg-muted p-3 ${radius.className}`}
            >
              <span className="text-xs font-medium">{radius.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
