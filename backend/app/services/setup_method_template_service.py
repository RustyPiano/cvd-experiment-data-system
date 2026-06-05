from app.schemas.setup_methods import SetupMethodTemplateListResponse, SetupMethodTemplateRead

SEED_TEMPLATES = [
    SetupMethodTemplateRead(
        template_key="group_fast_cvd",
        template_version=1,
        name="组内快速 CVD",
        institution="group",
        apparatus_description="Two-zone tube furnace CVD setup used by the group.",
        methods_text=(
            "A substrate and precursor are placed in a two-zone CVD furnace. The system is "
            "purged before growth, heated to the target profile, held during growth, and "
            "cooled under carrier gas."
        ),
        sample_placement_description=(
            "Substrate is placed downstream of the precursor according to the furnace "
            "coordinate system used in the run."
        ),
        reaction_flow_description=(
            "Purge, ramp, growth hold, and cool-down under programmed carrier gas flow."
        ),
        unpublished_reason="Internal group setup template",
        semantic_context={"temperature_reference": "furnace program setpoint"},
        has_packaged_diagram=False,
    )
]


class SetupMethodTemplateService:
    def list_templates(self) -> SetupMethodTemplateListResponse:
        return SetupMethodTemplateListResponse(items=SEED_TEMPLATES, total=len(SEED_TEMPLATES))

    def get_template(
        self,
        template_key: str,
        template_version: int | None = None,
    ) -> SetupMethodTemplateRead | None:
        matching = [item for item in SEED_TEMPLATES if item.template_key == template_key]
        if template_version is not None:
            matching = [item for item in matching if item.template_version == template_version]
        return max(matching, key=lambda item: item.template_version, default=None)
