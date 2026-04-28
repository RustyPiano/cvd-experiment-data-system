from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.recipe import RecipeCreate, RecipeListResponse, RecipeRead, RecipeUpdate
from app.services.recipe_service import RecipeService

router = APIRouter(prefix="/api/v1", tags=["recipes"])
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/recipes", response_model=RecipeListResponse)
def list_active_recipes(
    db: DbSession,
    _current_user: CurrentUser,
    material_system: Annotated[str | None, Query()] = None,
) -> RecipeListResponse:
    return RecipeService(db).list_active_recipes(material_system=material_system)


@router.get("/recipes/{recipe_id}", response_model=RecipeRead)
def get_recipe(
    recipe_id: UUID,
    db: DbSession,
    _current_user: CurrentUser,
) -> RecipeRead:
    return RecipeService(db).get_recipe(recipe_id)


@router.get("/admin/recipes", response_model=RecipeListResponse)
def list_admin_recipes(
    db: DbSession,
    current_user: CurrentUser,
    material_system: Annotated[str | None, Query()] = None,
    is_active: Annotated[bool | None, Query()] = None,
) -> RecipeListResponse:
    return RecipeService(db).list_admin_recipes(
        current_user=current_user,
        material_system=material_system,
        is_active=is_active,
    )


@router.post(
    "/admin/recipes",
    response_model=RecipeRead,
    status_code=status.HTTP_201_CREATED,
)
def create_recipe(
    payload: RecipeCreate,
    db: DbSession,
    current_user: CurrentUser,
) -> RecipeRead:
    return RecipeService(db).create_recipe(payload, current_user)


@router.get("/admin/recipes/{recipe_id}", response_model=RecipeRead)
def get_admin_recipe(
    recipe_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> RecipeRead:
    return RecipeService(db).get_admin_recipe(recipe_id, current_user)


@router.patch("/admin/recipes/{recipe_id}", response_model=RecipeRead)
def update_recipe(
    recipe_id: UUID,
    payload: RecipeUpdate,
    db: DbSession,
    current_user: CurrentUser,
) -> RecipeRead:
    return RecipeService(db).update_recipe(recipe_id, payload, current_user)


@router.delete("/admin/recipes/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_recipe(
    recipe_id: UUID,
    db: DbSession,
    current_user: CurrentUser,
) -> Response:
    RecipeService(db).deactivate_recipe(recipe_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
