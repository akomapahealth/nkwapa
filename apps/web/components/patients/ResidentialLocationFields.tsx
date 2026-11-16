'use client';

import { useState } from 'react';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { ResidentialPositionField } from '@/components/patients/ResidentialPositionField';
import { FieldError, fieldErrorProps } from '@/components/ui/field';
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
  DIGITAL_ADDRESS_ERROR,
  DIGITAL_ADDRESS_EXAMPLE,
  districtsForRegion,
  normalizeDigitalAddress,
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
 * this records where the patient lives, not where they receive care, so follow-up and home
 * visits can find them. Many patients have no street address: the Digital Address, a landmark
 * and an optional map position (#343) cover that.
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
  const addressId = `${idPrefix}-digital-address`;
  const [addressError, setAddressError] = useState<string>();

  const checkAddress = () => {
    const raw = value.residentialDigitalAddress.trim();
    if (!raw) {
      setAddressError(undefined);
      return;
    }
    const normalized = normalizeDigitalAddress(raw);
    if (!normalized) {
      setAddressError(DIGITAL_ADDRESS_ERROR);
      return;
    }
    setAddressError(undefined);
    if (normalized !== value.residentialDigitalAddress) {
      onChange({ ...value, residentialDigitalAddress: normalized });
    }
  };

  const setStatus = (status: PatientLocationStatus) => {
    if (status === 'RECORDED') {
      onChange({ ...value, residentialLocationStatus: status });
      return;
    }
    // Deliberate unknown / not-recorded clears granular fields.
    setAddressError(undefined);
    onChange({
      residentialLocationStatus: status,
      residentialRegion: '',
      residentialDistrict: '',
      residentialCommunity: '',
      residentialAddressNote: '',
      residentialDigitalAddress: '',
      residentialLandmark: '',
      position: null,
    });
  };

  const setRegion = (region: GhanaRegion) => {
    // Changing region invalidates any previously chosen district.
    onChange({ ...value, residentialRegion: region, residentialDistrict: '' });
  };

  return (
    <FormSectionCard
      title="Residential location"
      description="Where the patient lives, so follow-up and home visits can find them. Separate from their primary clinic."
      hint="Region is the only required part. When there is no street address, a Digital Address or the nearest landmark is enough. Choose “Unknown” if you asked and the patient does not know, or leave it “Not recorded” until you can capture it."
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-2">
          <Label htmlFor={addressId}>Ghana Digital Address</Label>
          <Input
            id={addressId}
            value={value.residentialDigitalAddress}
            disabled={!isRecorded}
            maxLength={16}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="uppercase tabular-nums"
            {...fieldErrorProps(addressId, addressError)}
            aria-describedby={[`${addressId}-hint`, addressError ? `${addressId}-error` : '']
              .filter(Boolean)
              .join(' ')}
            onChange={(event) => {
              onChange({ ...value, residentialDigitalAddress: event.currentTarget.value });
              if (addressError) setAddressError(undefined);
            }}
            onBlur={checkAddress}
          />
          <p id={`${addressId}-hint`} className="text-sm leading-5 text-muted-foreground">
            From the GhanaPostGPS app, for example{' '}
            <span className="whitespace-nowrap">{DIGITAL_ADDRESS_EXAMPLE}</span>.
          </p>
          <FieldError id={addressId} message={addressError} />
        </div>

        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${idPrefix}-landmark`}>Nearest landmark</Label>
          <Input
            id={`${idPrefix}-landmark`}
            value={value.residentialLandmark}
            disabled={!isRecorded}
            maxLength={160}
            aria-describedby={`${idPrefix}-landmark-hint`}
            onChange={(event) =>
              onChange({ ...value, residentialLandmark: event.currentTarget.value })
            }
          />
          <p id={`${idPrefix}-landmark-hint`} className="text-sm leading-5 text-muted-foreground">
            For example: opposite the Methodist church, blue kiosk.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-note`}>Address note</Label>
        <Textarea
          id={`${idPrefix}-note`}
          value={value.residentialAddressNote}
          disabled={!isRecorded}
          maxLength={280}
          rows={2}
          placeholder={isRecorded ? 'Directions from the landmark, gate colour, house name.' : ''}
          onChange={(event) => onChange({ ...value, residentialAddressNote: event.target.value })}
        />
      </div>

      <ResidentialPositionField
        idPrefix={idPrefix}
        value={value.position}
        disabled={!isRecorded}
        onChange={(position) => onChange({ ...value, position })}
      />
    </FormSectionCard>
  );
}
