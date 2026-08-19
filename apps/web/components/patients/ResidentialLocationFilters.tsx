'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  districtsForRegion,
  PATIENT_LOCATION_STATUS_LABELS,
  PATIENT_LOCATION_STATUS_OPTIONS,
  REGION_OPTIONS,
  type GhanaRegion,
  type PatientLocationStatus,
} from '@/lib/residential-location';

export interface ResidentialLocationFilterValue {
  region: GhanaRegion | '';
  district: string;
  community: string;
  status: PatientLocationStatus | '';
}

export const EMPTY_LOCATION_FILTER: ResidentialLocationFilterValue = {
  region: '',
  district: '',
  community: '',
  status: '',
};

const ALL = '__all__';

/**
 * Registry filter controls for residential location. Filtering only narrows
 * results inside the caller's clinic scope — it never crosses clinics.
 */
export function ResidentialLocationFilters({
  value,
  onChange,
}: {
  value: ResidentialLocationFilterValue;
  onChange: (next: ResidentialLocationFilterValue) => void;
}) {
  const districts = districtsForRegion(value.region);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <Label htmlFor="filter-region">Region</Label>
        <Select
          value={value.region || ALL}
          onValueChange={(next) =>
            onChange({
              ...value,
              region: next === ALL ? '' : (next as GhanaRegion),
              // Region change invalidates the district filter.
              district: '',
            })
          }
        >
          <SelectTrigger id="filter-region">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All regions</SelectItem>
            {REGION_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-district">District</Label>
        <Select
          value={value.district || ALL}
          onValueChange={(next) => onChange({ ...value, district: next === ALL ? '' : next })}
          disabled={!value.region}
        >
          <SelectTrigger id="filter-district">
            <SelectValue placeholder={value.region ? 'All districts' : 'Choose a region first'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All districts</SelectItem>
            {districts.map((district) => (
              <SelectItem key={district} value={district}>
                {district}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-community">Community</Label>
        <Input
          id="filter-community"
          type="search"
          placeholder="Search community"
          value={value.community}
          onChange={(event) => onChange({ ...value, community: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="filter-location-status">Location status</Label>
        <Select
          value={value.status || ALL}
          onValueChange={(next) =>
            onChange({ ...value, status: next === ALL ? '' : (next as PatientLocationStatus) })
          }
        >
          <SelectTrigger id="filter-location-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            {PATIENT_LOCATION_STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {PATIENT_LOCATION_STATUS_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
