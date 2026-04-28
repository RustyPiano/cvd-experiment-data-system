import app.models as models


def test_recipe_model_is_exported_with_expected_metadata() -> None:
    assert hasattr(models, "Recipe")
    assert hasattr(models, "RecipeStatus")

    recipe = models.Recipe

    assert recipe.__tablename__ == "recipes"
    assert models.RecipeStatus.ACTIVE.value == "active"
    assert models.RecipeStatus.INACTIVE.value == "inactive"
    assert not recipe.__table__.c.template_version_id.foreign_keys
    assert not recipe.__table__.c.project_id.foreign_keys
    assert recipe.__table__.c.created_by.foreign_keys
