from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.recipe import Recipe


class RecipeRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def create(self, recipe: Recipe) -> Recipe:
        self.db.add(recipe)
        self.db.flush()
        self.db.refresh(recipe)
        return recipe

    def save(self, recipe: Recipe) -> Recipe:
        self.db.add(recipe)
        self.db.flush()
        self.db.refresh(recipe)
        return recipe

    def get_by_id(self, recipe_id: UUID) -> Recipe | None:
        statement = select(Recipe).where(Recipe.id == recipe_id)
        return self.db.scalar(statement)

    def list_recipes(
        self,
        *,
        material_system: str | None = None,
        is_active: bool | None = None,
    ) -> list[Recipe]:
        statement = select(Recipe)
        statement = self._apply_filters(
            statement,
            material_system=material_system,
            is_active=is_active,
        )
        statement = statement.order_by(Recipe.created_at.desc())
        return list(self.db.scalars(statement).all())

    def count(
        self,
        *,
        material_system: str | None = None,
        is_active: bool | None = None,
    ) -> int:
        statement = select(func.count()).select_from(Recipe)
        statement = self._apply_filters(
            statement,
            material_system=material_system,
            is_active=is_active,
        )
        return self.db.scalar(statement) or 0

    def _apply_filters(
        self,
        statement,
        *,
        material_system: str | None,
        is_active: bool | None,
    ):
        if material_system is not None:
            statement = statement.where(Recipe.material_system == material_system)
        if is_active is not None:
            statement = statement.where(Recipe.is_active.is_(is_active))
        return statement
