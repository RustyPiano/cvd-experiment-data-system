from app.services.formula_display import render_formula_display


def test_render_formula_display_default_rules() -> None:
    assert render_formula_display("MoS2", "本征") == "MoS2"
    assert (
        render_formula_display(
            "MoS2/WS2",
            "垂直异质结",
            [
                {"formula": "WS2", "role": "上层", "layer_order": 2},
                {"formula": "MoS2", "role": "下层", "layer_order": 1},
            ],
        )
        == "MoS2/WS2"
    )
    assert (
        render_formula_display(
            "MoS2-WS2",
            "横向异质结",
            [{"formula": "MoS2"}, {"formula": "WS2"}],
        )
        == "MoS2-WS2"
    )
    assert (
        render_formula_display(
            "Nb:MoS2",
            "掺杂",
            [{"formula": "MoS2", "role": "基体"}, {"formula": "Nb", "role": "掺杂剂"}],
        )
        == "Nb:MoS2"
    )
