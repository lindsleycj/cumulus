
resource "aws_lambda_function" "discover_granules_task" {
  function_name    = "${var.prefix}-DiscoverGranules"
  filename         = "${path.module}/../../tasks/discover-granules/dist/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../tasks/discover-granules/dist/lambda.zip")
  handler          = "index.handler"
  role             = var.lambda_processing_role_arn
  runtime          = "nodejs10.x"
  timeout          = 300
  memory_size      = 512

  layers = [var.cumulus_message_adapter_lambda_layer_arn]

  environment {
    variables = {
      CMR_ENVIRONMENT             = var.cmr_environment
      stackName                   = var.prefix
      GranulesTable               = var.dynamo_tables.granules.name
      oauth_provider              = var.oauth_provider
      launchpad_passphrase        = var.launchpad_passphrase
      urs_id                      = var.urs_id
      urs_password_secret_name    = length(var.urs_password) == 0 ? null : aws_secretsmanager_secret.ingest_urs_password.name
      urs_url                     = var.urs_url
      archive_api_uri             = var.archive_api_uri

      CUMULUS_MESSAGE_ADAPTER_DIR = "/opt/"
    }
  }

  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = var.lambda_subnet_ids == null ? null : [aws_security_group.no_ingress_all_egress[0].id]
  }

  tags = merge(local.default_tags, { Project = var.prefix })
}