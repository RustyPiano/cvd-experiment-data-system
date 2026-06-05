from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.setup_methods import SetupMethodTemplateListResponse, SetupMethodTemplateRead
from app.services.setup_method_template_service import SetupMethodTemplateService

router = APIRouter(prefix="/api/v1/setup-method-templates", tags=["setup-method-templates"])
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=SetupMethodTemplateListResponse)
def list_setup_method_templates(current_user: CurrentUser) -> SetupMethodTemplateListResponse:
    return SetupMethodTemplateService().list_templates()


@router.get("/{template_key}", response_model=SetupMethodTemplateRead)
def get_setup_method_template(
    template_key: str,
    current_user: CurrentUser,
    version: Annotated[int | None, Query()] = None,
) -> SetupMethodTemplateRead:
    template = SetupMethodTemplateService().get_template(template_key, version)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Setup method template not found",
        )
    return template
