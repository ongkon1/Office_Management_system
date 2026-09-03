'use client';

import * as React from 'react';
import { Plug, RotateCcw, Settings2, ShieldCheck } from 'lucide-react';
import { FEATURE_FLAGS, type FeatureFlagKey } from '@/contracts/feature-flags';
import { mockAdminService } from '@/services/mock/admin';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout } from '@/components/feedback/alert';
import { Tabs } from '@/components/feedback/disclosure';
import { Switch } from '@/components/forms/inputs';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { toDurationView } from '@/lib/status';
import {
  applyMvpOnlyFlags,
  resetFeatureFlags,
  setFeatureFlag,
  useFeatureFlags,
} from '@/features/settings/flag-store';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

const WEEKDAY_LABEL = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const PHASE_LABEL = {
  mvp: 'MVP',
  phase_2: 'Product Phase 2',
  phase_3: 'Product Phase 3',
  phase_4: 'Product Phase 4',
} as const;

/**
 * FE-0732 — settings.
 *
 * Three panels, and the feature-flag one is the load-bearing part: switching a
 * module off removes its navigation entry and stops its route resolving,
 * immediately. A settings screen whose switches changed nothing would be a
 * worse lie than not having one, and the MVP-only preset is how `FE-0006` —
 * that the MVP stands alone — is actually demonstrated rather than asserted.
 *
 * Work-policy values are read-only here on purpose: editing a policy creates a
 * new version, which is a backend capability. Showing editable fields that
 * silently discard the change would be worse than showing the truth.
 */
export function SettingsScreens() {
  const { user } = useSession();
  const toast = useToast();
  const [tab, setTab] = React.useState('policy');
  const [failure, setFailure] = React.useState<string | null>(null);
  const flags = useFeatureFlags();

  const { state: policyState } = useAsync(
    () => mockAdminService.getWorkPolicySettings(user?.userId ?? ''),
    [user?.userId],
  );
  const { state: notificationState, reload: reloadNotifications } = useAsync(
    () => mockAdminService.listNotificationSettings(user?.userId ?? ''),
    [user?.userId],
  );

  if (policyState.status === 'loading') return <ReportsLoading label="settings" />;
  if (policyState.status !== 'success') {
    return <ReportsFallback result={policyState.failure} subject="Settings" />;
  }
  const policy = policyState.data;

  async function toggleNotification(
    key: string,
    channel: 'inApp' | 'email',
    enabled: boolean,
  ) {
    setFailure(null);
    const result = await mockAdminService.setNotificationSetting(
      user?.userId ?? '',
      key,
      channel,
      enabled,
    );
    if (result.status === 'success') {
      reloadNotifications();
      return;
    }
    setFailure(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  function toggleFlag(key: FeatureFlagKey, enabled: boolean) {
    setFeatureFlag(key, enabled);
    toast.show({
      tone: 'info',
      title: `${FEATURE_FLAGS[key].label} ${enabled ? 'enabled' : 'disabled'}`,
      description: enabled
        ? 'Its navigation entries and routes are available again.'
        : 'Its navigation entries disappear and its routes stop resolving.',
    });
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Settings"
        description="Work policy, notification delivery and the feature flags that gate each module."
        meta={<Badge tone="neutral">Version {policy.version} policy</Badge>}
        actions={
          <LinkButton variant="secondary" href="/admin/integrations">
            Integrations
          </LinkButton>
        }
      />

      {failure && (
        <Alert className="mt-4" tone="warning" title="Setting not changed" live>
          {failure}
        </Alert>
      )}

      <Tabs
        className="mt-5"
        items={[
          { key: 'policy', label: 'Work policy' },
          { key: 'notifications', label: 'Notifications' },
          { key: 'flags', label: 'Feature flags' },
        ]}
        activeKey={tab}
        onChange={setTab}
        label="Settings sections"
      />

      {tab === 'policy' && (
        <div className="mt-5 space-y-5">
          <Card>
            <CardHeader
              title={policy.policyName}
              description={`Version ${policy.version}, effective from ${policy.effectiveFromLabel}.`}
              actions={<Badge tone="neutral">Read-only</Badge>}
            />
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div>
                <dt className="text-caption text-ink-muted">Required active time</dt>
                <dd className="text-body font-semibold text-ink">
                  <Duration value={toDurationView(policy.requiredActiveMinutes)} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Recognized break</dt>
                <dd className="text-body font-semibold text-ink">
                  <Duration value={toDurationView(policy.recognizedBreakMinutes)} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Required total</dt>
                <dd className="text-body font-semibold text-ink">
                  <Duration value={toDurationView(policy.requiredTotalMinutes)} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Overtime above</dt>
                <dd className="text-body font-semibold text-ink">
                  <Duration value={toDurationView(policy.overtimeThresholdMinutes)} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Critical above</dt>
                <dd className="text-body font-semibold text-ink">
                  <Duration value={toDurationView(policy.criticalThresholdMinutes)} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Business timezone</dt>
                <dd className="text-body font-semibold text-ink">{policy.businessTimezone}</dd>
              </div>
              <div className="sm:col-span-2 xl:col-span-3">
                <dt className="text-caption text-ink-muted">Working weekdays</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {policy.workingWeekdays.map((weekday) => (
                    <Badge key={weekday} tone="accent">
                      {WEEKDAY_LABEL[weekday]}
                    </Badge>
                  ))}
                </dd>
              </div>
            </dl>

            <Callout tone="info" className="mt-4">
              A normal full day is {toDurationView(policy.requiredActiveMinutes).display} active
              plus one separate {toDurationView(policy.recognizedBreakMinutes).display} break,{' '}
              {toDurationView(policy.requiredTotalMinutes).display} in total. Both thresholds must
              be met for a day to count as complete, and the break is recognized once per day —
              never per entry.
            </Callout>

            <Alert className="mt-4" tone="info" title="Why this is read-only">
              {policy.readOnlyReason} {policy.versioningNote}
            </Alert>
          </Card>
        </div>
      )}

      {tab === 'notifications' && (
        <Card className="mt-5">
          <CardHeader
            title="Notification delivery"
            description="Which notifications are sent, and through which channel."
          />
          {notificationState.status === 'success' ? (
            <ul className="mt-4 space-y-2">
              {notificationState.data.map((setting) => (
                <li key={setting.key} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                        {setting.label}
                        {setting.isMandatory && (
                          <Badge tone="warning" icon={<ShieldCheck aria-hidden className="size-3.5" />}>
                            Required
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-caption text-ink-muted">{setting.description}</p>
                      {setting.isMandatory && (
                        <p className="mt-1 text-caption text-undertime">
                          Required by the work policy and cannot be switched off.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <Switch
                        checked={setting.inApp}
                        disabled={setting.isMandatory}
                        onCheckedChange={(checked) =>
                          toggleNotification(setting.key, 'inApp', checked)
                        }
                        label="In app"
                      />
                      <Switch
                        checked={setting.email}
                        disabled={setting.isMandatory}
                        onCheckedChange={(checked) =>
                          toggleNotification(setting.key, 'email', checked)
                        }
                        label="Email"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-body-sm text-ink-muted">Loading notification settings…</p>
          )}
        </Card>
      )}

      {tab === 'flags' && (
        <div className="mt-5 space-y-5">
          <Callout tone="warning">
            These switches take effect immediately. Turning a module off removes its navigation
            entries and stops its routes resolving — a disabled module reads as absent, never as
            broken.
          </Callout>

          <Card>
            <CardHeader
              title="Feature flags"
              description="Each flag gates a module delivered after the MVP."
              actions={
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeading={<Settings2 aria-hidden className="size-4" />}
                    onClick={() => {
                      applyMvpOnlyFlags();
                      toast.show({
                        tone: 'info',
                        title: 'MVP-only mode',
                        description:
                          'Every post-MVP module is off. The MVP flows stand on their own with no dependency on a flagged module.',
                      });
                    }}
                  >
                    MVP only
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeading={<RotateCcw aria-hidden className="size-4" />}
                    onClick={() => {
                      resetFeatureFlags();
                      toast.show({ tone: 'info', title: 'Flags reset to the demo defaults' });
                    }}
                  >
                    Reset
                  </Button>
                </div>
              }
            />
            <ul className="mt-4 space-y-2">
              {Object.values(FEATURE_FLAGS).map((flag) => (
                <li key={flag.key} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                        {flag.label}
                        <Badge tone={flag.phase === 'mvp' ? 'accent' : 'neutral'}>
                          {PHASE_LABEL[flag.phase]}
                        </Badge>
                      </p>
                      <p className="mt-0.5 text-caption text-ink-muted">{flag.description}</p>
                      {flag.routes.length > 0 && (
                        <p className="mt-1 text-caption text-ink-subtle">
                          Routes: {flag.routes.join(', ')}
                        </p>
                      )}
                    </div>
                    <Switch
                      checked={flags[flag.key]}
                      onCheckedChange={(checked) => toggleFlag(flag.key, checked)}
                      label={flags[flag.key] ? 'Enabled' : 'Disabled'}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </PageContainer>
  );
}

/**
 * FE-0734 — integration placeholders.
 *
 * Every card says `Not configured` and describes what the integration *would*
 * do. The view model has no `connected` variant at all, so a placeholder cannot
 * claim a live connection even by mistake — a demo that appears to be posting
 * to payroll is the specific failure this screen is written to avoid.
 */
export function IntegrationSettings() {
  const { user } = useSession();
  const { state } = useAsync(
    () => mockAdminService.listIntegrations(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="integrations" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Integrations" />;
  }
  const integrations = state.data;

  return (
    <PageContainer width="full">
      <PageHeader
        title="Integrations"
        description="Placeholders for the external services this product will connect to."
        meta={<Badge tone="warning">None configured</Badge>}
        actions={
          <LinkButton variant="secondary" href="/settings">
            Settings
          </LinkButton>
        }
      />

      <Alert className="mt-5" tone="warning" title="Nothing here is connected">
        No integration is configured, authenticated or exchanging data. These cards describe what
        each one would do once it is built, and which backend task delivers it. Nothing on this
        screen reaches an external service.
      </Alert>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.key} className="h-full">
            <div className="flex items-start justify-between gap-3">
              <h2 className="flex items-center gap-2 text-h3 text-ink">
                <Plug aria-hidden className="size-4 shrink-0 text-ink-muted" />
                {integration.label}
              </h2>
              <Badge tone="neutral">{integration.stateLabel}</Badge>
            </div>
            <p className="mt-2 text-caption text-ink-muted">{integration.description}</p>
            <p className="mt-3 text-body-sm text-ink">{integration.plannedBehaviour}</p>
            <dl className="mt-4 border-t border-border pt-3">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-caption text-ink-muted">Delivered in</dt>
                <dd className="text-caption font-medium text-ink">
                  {integration.deliveryPhaseLabel}
                </dd>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <dt className="text-caption text-ink-muted">Backend tasks</dt>
                <dd className="text-caption font-medium text-ink">{integration.backendTaskIds}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
