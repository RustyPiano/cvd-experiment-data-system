from datetime import UTC, datetime

from app.models.recipe import Recipe


def test_recipe_repository_filters_material_system_and_active_state(
    db_session,
    active_user,
) -> None:
    from app.repositories.recipe_repository import RecipeRepository

    repository = RecipeRepository(db_session)
    earlier = datetime(2026, 4, 28, 9, 0, tzinfo=UTC)
    middle = datetime(2026, 4, 28, 10, 0, tzinfo=UTC)
    later = datetime(2026, 4, 28, 11, 0, tzinfo=UTC)

    mos2_active = repository.create(
        Recipe(
            name="MoS2 active",
            material_system="MoS2",
            default_payload_json={"temperature_c": 720},
            created_by=active_user.id,
            is_active=True,
            created_at=earlier,
            updated_at=earlier,
        )
    )
    repository.create(
        Recipe(
            name="WS2 active",
            material_system="WS2",
            default_payload_json={"temperature_c": 760},
            is_active=True,
            created_at=middle,
            updated_at=middle,
        )
    )
    mos2_inactive = repository.create(
        Recipe(
            name="MoS2 inactive",
            material_system="MoS2",
            default_payload_json={"temperature_c": 680},
            is_active=False,
            created_at=later,
            updated_at=later,
        )
    )

    assert repository.get_by_id(mos2_active.id) == mos2_active

    all_recipes = repository.list_recipes()
    assert [recipe.name for recipe in all_recipes] == [
        mos2_inactive.name,
        "WS2 active",
        mos2_active.name,
    ]
    assert repository.count() == 3

    mos2_recipes = repository.list_recipes(material_system="MoS2")
    assert {recipe.id for recipe in mos2_recipes} == {mos2_active.id, mos2_inactive.id}
    assert repository.count(material_system="MoS2") == 2

    active_recipes = repository.list_recipes(is_active=True)
    assert {recipe.id for recipe in active_recipes} == {mos2_active.id, all_recipes[1].id}
    assert repository.count(is_active=True) == 2

    active_mos2_recipes = repository.list_recipes(material_system="MoS2", is_active=True)
    assert [recipe.id for recipe in active_mos2_recipes] == [mos2_active.id]
    assert repository.count(material_system="MoS2", is_active=True) == 1
