'use client';

import { MapPin } from 'lucide-react';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  districtsForRegion,
  PATIENT_LOCATION_STATUS_LABELS,
  PATIENT_LOCATION_STATUS_OPTIONS,
  REGION_OPTIONS,
  type GhanaRegion,
  type PatientLocationStatus,
  type ResidentialLocationValue,
} from '@/lib/residential-location';

/**
 * Reusable "Residential location" form section used by both the register and
 * edit patient screens. It is deliberately separate from the primary clinic:
 * this records where the patient lives, not where they receive care. No GPS.
 *
 * The control enforces the same status invariant as the API: granular fields
 * are only editable when the status is RECORDED, and switching away from
 * RECORDED clears them so a missing location is never ambiguous blank text.
 */
export function ResidentialLocationFields({
  value,
  onChange,
  idPrefix = 'residential',
}: {
  value: ResidentialLocationValue;
  onChange: (next: ResidentialLocationValue) => void;
  idPrefix?: string;
}) {
  const isRecorded = value.residentialLocationStatus === 'RECORDED';
  const districts = districtsForRegion(value.residentialRegion);

  const setStatus = (status: PatientLocationStatus) => {
    if (status === 'RECORDED') {
      onChange({ ...value, residentialLocationStatus: status });
      return;
    }
    // Deliberate unknown / not-recorded clears granular fields.
    onChange({
      residentialLocationStatus: status,
      residentialRegion: '',
      residentialDistrict: '',
      residentialCommunity: '',
      residentialAddressNote: '',
    });
  };

  const setRegion = (region: GhanaRegion) => {
    // Changing region invalidates any previously chosen district.
    onChange({ ...value, residentialRegion: region, residentialDistrict: '' });
  };

  return (
    <FormSectionCard
      title="Residential location"
      description="Where the patient lives. This is separate from their primary clinic and never uses GPS."
      hint="Record region, district and community when known. Choose “Unknown” if you asked and the patient does not know, or leave it “Not recorded” until you can capture it."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-status`}>Location status</Label>
          <Select value={value.residentialLocationStatus} onValueChange={setStatus}>
            <SelectTrigger id={`${idPrefix}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PATIENT_LOCATION_STATUS_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {PATIENT_LOCATION_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-region`}>Region</Label>
          <Select
            value={value.residentialRegion || undefined}
            onValueChange={(region) => setRegion(region as GhanaRegion)}
            disabled={!isRecorded}
          >
            <SelectTrigger id={`${idPrefix}-region`}>
              <SelectValue placeholder={isRecorded ? 'Select a region' : '—'} />
            </SelectTrigger>
            <SelectContent>
              {REGION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-district`}>District</Label>
          <Select
            value={value.residentialDistrict || undefined}
            onValueChange={(district) => onChange({ ...value, residentialDistrict: district })}
            disabled={!isRecorded || !value.residentialRegion}
          >
            <SelectTrigger id={`${idPrefix}-district`}>
              <SelectValue
                placeholder={
                  value.residentialRegion ? 'Select a district' : 'Choose a region first'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {districts.map((district) => (
                <SelectItem key={district} value={district}>
                  {district}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-community`}>Community / town</Label>
          <Input
            id={`${idPrefix}-community`}
            value={value.residentialCommunity}
            disabled={!isRecorded}
            maxLength={120}
            placeholder={isRecorded ? 'e.g. Osu' : ''}
            onChange={(event) => onChange({ ...value, residentialCommunity: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-note`}>Address note (optional)</Label>
        <Textarea
          id={`${idPrefix}-note`}
          value={value.residentialAddressNote}
          disabled={!isRecorded}
          maxLength={280}
          rows={2}
          placeholder={
            isRecorded ? 'Landmark or directions — no need for a full postal address.' : ''
          }
          onChange={(event) => onChange({ ...value, residentialAddressNote: event.target.value })}
        />
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" aria-hidden />
          Residence only — do not enter GPS coordinates or a clinic location.
        </p>
      </div>
    </FormSectionCard>
  );
}
