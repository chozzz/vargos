import { PipeTransform, Injectable, BadRequestException } from "@nestjs/common";

@Injectable()
export class ParseJsonPipe implements PipeTransform {
  transform(value: string): Record<string, unknown> {
    try {
      // Check if value is already an object
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        return value;
      }

      if (typeof value !== "string") {
        throw new Error("Input must be a string");
      }

      const parsed = JSON.parse(value);

      if (
        typeof parsed !== "object" ||
        Array.isArray(parsed) ||
        parsed === null
      ) {
        throw new Error("Parsed value must be an object");
      }

      return parsed;
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? `Invalid JSON: ${error.message}`
          : "Invalid JSON format",
      );
    }
  }
}
