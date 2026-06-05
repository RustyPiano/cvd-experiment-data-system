from collections.abc import Callable

from app.models.setup_methods import ExperimentSetupSnapshot
from app.schemas.experiment_validation import ExperimentValidationIssue

IssueFactory = Callable[[str, str, str], ExperimentValidationIssue]


def validate_setup_content(
    snapshot: ExperimentSetupSnapshot | None,
    issue_factory: IssueFactory,
    errors: list[ExperimentValidationIssue],
) -> None:
    if snapshot is None:
        errors.append(issue_factory("setup_methods", "root", "Setup methods are required"))
        return

    if _is_blank(snapshot.setup_key_snapshot):
        errors.append(issue_factory("setup_methods", "setup_key_snapshot", "Setup key is required"))
    if _is_blank(snapshot.setup_name_snapshot):
        errors.append(
            issue_factory("setup_methods", "setup_name_snapshot", "Setup name is required")
        )
    if snapshot.diagram_file_asset_id is None:
        errors.append(
            issue_factory(
                "setup_methods",
                "diagram_file_asset_id",
                "Setup diagram is required",
            )
        )
    if _is_blank(snapshot.methods_text_snapshot):
        errors.append(
            issue_factory("setup_methods", "methods_text_snapshot", "Methods text is required")
        )
    if _is_blank(snapshot.sample_placement_description_snapshot):
        errors.append(
            issue_factory(
                "setup_methods",
                "sample_placement_description_snapshot",
                "Sample placement description is required",
            )
        )
    if _is_blank(snapshot.reaction_flow_description_snapshot):
        errors.append(
            issue_factory(
                "setup_methods",
                "reaction_flow_description_snapshot",
                "Reaction flow description is required",
            )
        )
    if _is_blank(snapshot.reference_paper_url_snapshot) and _is_blank(
        snapshot.unpublished_reason_snapshot
    ):
        errors.append(
            issue_factory(
                "setup_methods",
                "reference",
                "Reference paper URL or unpublished reason is required",
            )
        )
    if (
        snapshot.source_template_key is not None
        and not snapshot.is_same_as_template
        and _is_blank(snapshot.deviation_note)
    ):
        errors.append(
            issue_factory(
                "setup_methods",
                "deviation_note",
                "Deviation note is required when setup differs from template",
            )
        )


def _is_blank(value: object) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())
