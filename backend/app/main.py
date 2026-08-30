from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.commands.export_v2_schema import apply_characterization_openapi_contract
from app.core.config import get_settings

settings = get_settings()
app = FastAPI(title=settings.app_name, debug=settings.app_debug)


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    del request
    invalid = []
    for error in exc.errors():
        error_type = str(error["type"])
        reason = (
            "length"
            if any(token in error_type for token in ("length", "too_long", "too_short"))
            else "type"
            if "type" in error_type or "parsing" in error_type
            else "value"
        )
        loc = error.get("loc") or ("body",)
        key = next((str(part) for part in reversed(loc) if isinstance(part, str)), "body")
        invalid.append({"key": key, "reason": reason})
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": {"invalid": invalid}},
    )


if settings.cors_allow_origins_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

app.include_router(api_router)

_default_openapi = app.openapi


def openapi_with_characterization_contract() -> dict[str, Any]:
    if app.openapi_schema is None:
        apply_characterization_openapi_contract(_default_openapi())
    assert app.openapi_schema is not None
    return app.openapi_schema


app.openapi = openapi_with_characterization_contract
