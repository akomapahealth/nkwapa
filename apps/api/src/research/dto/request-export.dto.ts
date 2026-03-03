export interface RequestExportDto {
  fileFormat?: 'csv' | 'json'; // default: 'csv'
}

export interface RejectExportDto {
  reason: string;
}
