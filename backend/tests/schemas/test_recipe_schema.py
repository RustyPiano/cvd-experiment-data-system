from app.models.recipe import Recipe


def test_recipe_schemas_are_exported_and_validate_orm_recipe(db_session, active_user) -> None:
    from app.schemas import RecipeCreate, RecipeListResponse, RecipeRead, RecipeUpdate

    create_schema = RecipeCreate(
        name="MoS2 baseline",
        material_system="MoS2",
        default_payload_json={"temperature_c": 720},
        description="Baseline growth recipe",
    )
    update_schema = RecipeUpdate(is_active=False)

    assert create_schema.name == "MoS2 baseline"
    assert update_schema.is_active is False

    recipe = Recipe(
        name=create_schema.name,
        material_system=create_schema.material_system,
        default_payload_json=create_schema.default_payload_json,
        description=create_schema.description,
        created_by=active_user.id,
    )
    db_session.add(recipe)
    db_session.flush()
    db_session.refresh(recipe)

    read_schema = RecipeRead.model_validate(recipe)
    response_schema = RecipeListResponse(items=[read_schema], total=1)

    assert read_schema.id == recipe.id
    assert read_schema.created_by == active_user.id
    assert read_schema.default_payload_json == {"temperature_c": 720}
    assert response_schema.total == 1
