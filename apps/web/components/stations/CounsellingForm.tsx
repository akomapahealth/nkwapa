'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquareHeart } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch } from '@/lib/api';
import { readApiError } from '@/lib/ops';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineNotice } from '@/components/ops/OpsShared';

export const COUNSELLING_TOPICS = {
  BLOOD_PRESSURE: 'Blood pressure',
  GLUCOSE_DIABETES: 'Blood sugar and diabetes',
  WEIGHT_NUTRITION: 'Weight and nutrition',
  PHYSICAL_ACTIVITY: 'Physical activity',
  TOBACCO: 'Tobacco',
  ALCOHOL: 'Alcohol',
  MEDICATION_ADHERENCE: 'Taking medication',
  OTHER: 'Other',
} as const;
type Topic = keyof typeof COUNSELLING_TOPICS;

const FOLLOW_UP_WINDOWS = {
  TODAY: 'Today',
  WITHIN_1_WEEK: 'Within 1 week',
  WITHIN_1_MONTH: 'Within 1 month',
  WITHIN_3_MONTHS: 'Within 3 months',
  OTHER: 'Other',
} as const;

const URGENCY = { ROUTINE: 'Routine', SOON: 'Soon', URGENT: 'Urgent' } as const;

export interface CounsellingRecord {
  id: string;
  topics: Topic[];
  topicOther: string | null;
  adviceGiven: string;
  followUpRecommended: boolean;
  followUpWindow: string;
  followUpOther: string | null;
  referralRecommended: boolean;
  referralTo: string | null;
  referralReason: string | null;
  referralUrgency: keyof typeof URGENCY | null;
  author: { id: string; displayName: string };
  version: number;
  lockedAt: string | null;
  updatedAt: string;
}

interface FormState {
  topics: Topic[];
  topicOther: string;
  adviceGiven: string;
  followUpRecommended: boolean;
  followUpWindow: string;
  followUpOther: string;
  referralRecommended: boolean;
  referralTo: string;
  referralReason: string;
  referralUrgency: keyof typeof URGENCY | '';
}

const EMPTY: FormState = {
  topics: [],
  topicOther: '',
  adviceGiven: '',
  followUpRecommended: false,
  followUpWindow: 'NOT_ASSESSED',
  followUpOther: '',
  referralRecommended: false,
  referralTo: '',
  referralReason: '',
  referralUrgency: '',
};

function fromRecord(record: CounsellingRecord | null): FormState {
  if (!record) return EMPTY;
  return {
    topics: record.topics,
    topicOther: record.topicOther ?? '',
    adviceGiven: record.adviceGiven,
    followUpRecommended: record.followUpRecommended,
    followUpWindow: record.followUpWindow,
    followUpOther: record.followUpOther ?? '',
    referralRecommended: record.referralRecommended,
    referralTo: record.referralTo ?? '',
    referralReason: record.referralReason ?? '',
    referralUrgency: record.referralUrgency ?? '',
  };
}

/**
 * What the review station told the patient (#167): topics, advice, follow-up and referral.
 *
 * Online only, like clinical notes: the record is shared by everyone reviewing this patient and
 * locks when the session completes, so a copy queued on one laptop could land after that.
 */
export function CounsellingForm({
  clinicId,
  encounterId,
  canEdit,
  onSaved,
  onLoaded,
}: {
  clinicId: string;
  encounterId: string;
  canEdit: boolean;
  onSaved?: (record: CounsellingRecord) => void;
  onLoaded?: (record: CounsellingRecord | null) => void;
}) {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const [record, setRecord] = useState<CounsellingRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const path = `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/counselling`;

  const load = useCallback(async () => {
    if (!getToken || !isOnline) {
      setLoading(false);
      return;
    }
    try {
      const response = await apiFetch(path, { getToken, activeClinicId: clinicId });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as { record: CounsellingRecord | null };
      setRecord(body.record);
      setForm(fromRecord(body.record));
      onLoaded?.(body.record);
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  }, [getToken, isOnline, path, clinicId, onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = Boolean(record?.lockedAt);
  const editable = canEdit && !locked && isOnline;

  async function save() {
    if (!getToken) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await apiFetch(path, {
        method: 'PUT',
        getToken,
        activeClinicId: clinicId,
        body: JSON.stringify({
          ...(record ? { expectedVersion: record.version } : {}),
          topics: form.topics,
          topicOther: form.topics.includes('OTHER') ? form.topicOther : null,
          adviceGiven: form.adviceGiven,
          followUpRecommended: form.followUpRecommended,
          followUpWindow: form.followUpRecommended ? form.followUpWindow : 'NOT_ASSESSED',
          followUpOther: form.followUpWindow === 'OTHER' ? form.followUpOther : null,
          referralRecommended: form.referralRecommended,
          referralTo: form.referralRecommended ? form.referralTo : null,
          referralReason: form.referralRecommended ? form.referralReason : null,
          referralUrgency:
            form.referralRecommended && form.referralUrgency ? form.referralUrgency : null,
        }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = (await response.json()) as { record: CounsellingRecord };
      setRecord(body.record);
      setForm(fromRecord(body.record));
      setStatus({ tone: 'success', text: 'Counselling saved.' });
      onSaved?.(body.record);
    } catch (error) {
      setStatus({ tone: 'error', text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  const toggleTopic = (topic: Topic, checked: boolean) =>
    setForm((current) => ({
      ...current,
      topics: checked
        ? [...current.topics, topic]
        : current.topics.filter((value) => value !== topic),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MessageSquareHeart className="h-5 w-5 text-primary" aria-hidden="true" />
          Counselling and advice
        </CardTitle>
        <CardDescription>
          {locked
            ? `Recorded by ${record?.author.displayName}. The session is complete; a doctor can add to it with a note addendum.`
            : 'Record the health education given and any follow-up or referral.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!isOnline ? (
          <InlineNotice tone="warning" live={false}>
            Counselling needs a connection to load and save.
          </InlineNotice>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <fieldset disabled={!editable} className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">Topics discussed</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(COUNSELLING_TOPICS) as Topic[]).map((topic) => (
                  <label key={topic} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.topics.includes(topic)}
                      onCheckedChange={(checked) => toggleTopic(topic, checked === true)}
                    />
                    {COUNSELLING_TOPICS[topic]}
                  </label>
                ))}
              </div>
              {form.topics.includes('OTHER') ? (
                <Input
                  aria-label="Other topic"
                  value={form.topicOther}
                  maxLength={200}
                  onChange={(event) => setForm({ ...form, topicOther: event.target.value })}
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="adviceGiven">Advice given</Label>
              <Textarea
                id="adviceGiven"
                rows={4}
                maxLength={5000}
                value={form.adviceGiven}
                onChange={(event) => setForm({ ...form, adviceGiven: event.target.value })}
              />
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id="followUpRecommended"
                  checked={form.followUpRecommended}
                  onCheckedChange={(checked) =>
                    setForm({
                      ...form,
                      followUpRecommended: checked === true,
                      followUpWindow: checked === true ? 'WITHIN_1_MONTH' : 'NOT_ASSESSED',
                    })
                  }
                />
                <Label htmlFor="followUpRecommended">Follow-up recommended</Label>
              </div>
              {form.followUpRecommended ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={form.followUpWindow}
                    onValueChange={(value) => setForm({ ...form, followUpWindow: value })}
                  >
                    <SelectTrigger aria-label="Follow-up window">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FOLLOW_UP_WINDOWS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.followUpWindow === 'OTHER' ? (
                    <Input
                      aria-label="Other follow-up timing"
                      value={form.followUpOther}
                      maxLength={120}
                      onChange={(event) => setForm({ ...form, followUpOther: event.target.value })}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  id="referralRecommended"
                  checked={form.referralRecommended}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, referralRecommended: checked === true })
                  }
                />
                <Label htmlFor="referralRecommended">Referral recommended</Label>
              </div>
              {form.referralRecommended ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label="Referred to"
                    placeholder="Where to (facility or service)"
                    value={form.referralTo}
                    maxLength={200}
                    onChange={(event) => setForm({ ...form, referralTo: event.target.value })}
                  />
                  <Select
                    value={form.referralUrgency || undefined}
                    onValueChange={(value) =>
                      setForm({ ...form, referralUrgency: value as keyof typeof URGENCY })
                    }
                  >
                    <SelectTrigger aria-label="Referral urgency">
                      <SelectValue placeholder="Urgency" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(URGENCY).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    aria-label="Reason for referral"
                    className="sm:col-span-2"
                    rows={2}
                    maxLength={2000}
                    value={form.referralReason}
                    onChange={(event) => setForm({ ...form, referralReason: event.target.value })}
                  />
                </div>
              ) : null}
            </div>
          </fieldset>
        )}
        {status ? <InlineNotice tone={status.tone}>{status.text}</InlineNotice> : null}
        {editable ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : 'Save counselling'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
