import { BadRequestException, Injectable } from "@nestjs/common";
import { createHmac } from "crypto";
import { RESEARCH_TIMESTAMP_ROUNDING_MINUTES } from "./research-policy";

@Injectable()
export class DeIdentificationService {
  private hmacKey: string | null = null;

  clinicKey(clinicId: string): string {
    return this.entityKey(clinicId, "clinic", clinicId);
  }

  patientKey(clinicId: string, patientId: string): string {
    return this.entityKey(clinicId, "patient", patientId);
  }

  entityKey(clinicId: string, entityType: string, internalId: string | null | undefined): string {
    if (!internalId) {
      return "";
    }

    const hmac = createHmac("sha256", this.getHmacKey());
    hmac.update(`${clinicId}:${entityType}:${internalId}`);
    return hmac.digest("hex").slice(0, 32);
  }

  birthYear(dob: Date | null): number | null {
    return dob ? dob.getUTCFullYear() : null;
  }

  roundTimestamp(value: Date | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const roundedMs = RESEARCH_TIMESTAMP_ROUNDING_MINUTES * 60 * 1000;
    const floored = Math.floor(value.getTime() / roundedMs) * roundedMs;
    return new Date(floored).toISOString();
  }

  formatDate(value: Date | null | undefined): string | null {
    if (!value) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }

  csvFromRows(headers: string[], rows: Array<Record<string, unknown>>): string {
    const headerLine = headers.join(",");
    const dataLines = rows.map((row) =>
      headers.map((header) => this.escapeCsvValue(row[header])).join(",")
    );
    return [headerLine, ...dataLines].join("\n");
  }

  parseJsonObject(payloadJson: string | null | undefined): Record<string, unknown> {
    if (!payloadJson) {
      return {};
    }

    try {
      const parsed = JSON.parse(payloadJson) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  numberFromUnknown(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  stringFromUnknown(value: unknown): string | null {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  booleanFromUnknown(value: unknown): boolean | null {
    if (typeof value === "boolean") {
      return value;
    }
    return null;
  }

  private escapeCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }
    if (typeof value === "string") {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return String(value);
  }

  private getHmacKey(): string {
    if (this.hmacKey) {
      return this.hmacKey;
    }

    const value = process.env.RESEARCH_HMAC_KEY?.trim();
    if (!value) {
      throw new BadRequestException("RESEARCH_HMAC_KEY must be configured for research exports");
    }

    this.hmacKey = value;
    return value;
  }
}
