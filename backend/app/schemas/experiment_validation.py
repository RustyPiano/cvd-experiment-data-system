from pydantic import BaseModel, Field


class ExperimentValidationIssue(BaseModel):
    module_key: str
    field_path: str
    message: str


class ExperimentValidationResponse(BaseModel):
    ok: bool
    errors: list[ExperimentValidationIssue] = Field(default_factory=list)
    warnings: list[ExperimentValidationIssue] = Field(default_factory=list)
