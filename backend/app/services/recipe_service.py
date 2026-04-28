from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.recipe import Recipe
from app.models.user import User, UserRole
from app.repositories.recipe_repository import RecipeRepository
from app.schemas.recipe import RecipeCreate, RecipeListResponse, RecipeRead, RecipeUpdate
from app.services.audit_service import AuditService


class RecipeService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.audit = AuditService(db)
        self.recipes = RecipeRepository(db)

    def list_active_recipes(
        self,
        *,
        material_system: str | None = None,
    ) -> RecipeListResponse:
        items = self.recipes.list_recipes(
            material_system=material_system,
            is_active=True,
        )
        return RecipeListResponse(
            items=[RecipeRead.model_validate(item) for item in items],
            total=len(items),
        )

    def list_admin_recipes(
        self,
        *,
        current_user: User,
        material_system: str | None = None,
        is_active: bool | None = None,
    ) -> RecipeListResponse:
        self._require_admin(current_user)
        items = self.recipes.list_recipes(
            material_system=material_system,
            is_active=is_active,
        )
        return RecipeListResponse(
            items=[RecipeRead.model_validate(item) for item in items],
            total=len(items),
        )

    def create_recipe(
        self,
        payload: RecipeCreate,
        current_user: User,
    ) -> RecipeRead:
        self._require_admin(current_user)
        recipe = Recipe(**payload.model_dump(), created_by=current_user.id)
        try:
            saved = self.recipes.create(recipe)
            self.audit.record_event(
                actor=current_user,
                entity_type="recipe",
                entity_id=saved.id,
                action="create",
                before_json=None,
                after_json=self._serialize_recipe(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Recipe already exists",
            ) from exc
        return RecipeRead.model_validate(saved)

    def get_recipe(self, recipe_id: UUID) -> RecipeRead:
        recipe = self.recipes.get_by_id(recipe_id)
        if recipe is None or not recipe.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found",
            )
        return RecipeRead.model_validate(recipe)

    def get_admin_recipe(self, recipe_id: UUID, current_user: User) -> RecipeRead:
        self._require_admin(current_user)
        recipe = self.recipes.get_by_id(recipe_id)
        if recipe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found",
            )
        return RecipeRead.model_validate(recipe)

    def update_recipe(
        self,
        recipe_id: UUID,
        payload: RecipeUpdate,
        current_user: User,
    ) -> RecipeRead:
        self._require_admin(current_user)
        recipe = self.recipes.get_by_id(recipe_id)
        if recipe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found",
            )

        updates = payload.model_dump(exclude_unset=True)
        before = self._serialize_recipe(recipe)
        for field, value in updates.items():
            setattr(recipe, field, value)

        try:
            saved = self.recipes.save(recipe)
            self.audit.record_event(
                actor=current_user,
                entity_type="recipe",
                entity_id=saved.id,
                action="update",
                before_json=before,
                after_json=self._serialize_recipe(saved),
            )
            self.db.commit()
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Recipe already exists",
            ) from exc
        return RecipeRead.model_validate(saved)

    def deactivate_recipe(self, recipe_id: UUID, current_user: User) -> None:
        self._require_admin(current_user)
        recipe = self.recipes.get_by_id(recipe_id)
        if recipe is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Recipe not found",
            )

        before = self._serialize_recipe(recipe)
        recipe.is_active = False

        saved = self.recipes.save(recipe)
        self.audit.record_event(
            actor=current_user,
            entity_type="recipe",
            entity_id=saved.id,
            action="deactivate",
            before_json=before,
            after_json=self._serialize_recipe(saved),
        )
        self.db.commit()

    def _require_admin(self, current_user: User) -> None:
        if current_user.role != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

    def _serialize_recipe(self, recipe: Recipe) -> dict:
        return {
            "id": str(recipe.id),
            "name": recipe.name,
            "template_version_id": (
                str(recipe.template_version_id) if recipe.template_version_id else None
            ),
            "project_id": str(recipe.project_id) if recipe.project_id else None,
            "material_system": recipe.material_system,
            "default_payload_json": recipe.default_payload_json,
            "description": recipe.description,
            "created_by": str(recipe.created_by) if recipe.created_by else None,
            "is_active": recipe.is_active,
        }
