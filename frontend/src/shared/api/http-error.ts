export class HttpError extends Error {
  status: number;
  detail: string | null;
  payload: unknown;

  constructor(status: number, detail: string | null, payload: unknown) {
    super(detail ?? `Request failed with status ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.detail = detail;
    this.payload = payload;
  }
}
