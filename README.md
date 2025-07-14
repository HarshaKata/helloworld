# TSKronos WebService: Architecture Deep Dive and CBB Migration Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Complete Request Flow Analysis](#complete-request-flow-analysis)
3. [Traffic Switching Mechanism](#traffic-switching-mechanism)
4. [Resource Management and Conflict Resolution](#resource-management-and-conflict-resolution)
5. [Automatic vs Manual Resource Updates](#automatic-vs-manual-resource-updates)

---

## Architecture Overview

### What is TSKronos WebService?

TSKronos WebService serves as the **control plane API** for Amazon Timestream for InfluxDB, functioning as the central management system for database lifecycle operations. It provides a comprehensive suite of capabilities:

- **Database Lifecycle Management**: Complete CRUD operations for InfluxDB instances
- **Authentication & Authorization**: Fine-grained access control through FAS (Fine-grained Access Service)
- **Resource Metadata Management**: Comprehensive tagging and organization of database resources
- **Cross-Service Integration**: Seamless integration with AWS services and Alameda building blocks

### High-Level Architecture Components

#### 1. Customer Interface Layer
```
External Customers (Console/CLI/SDK)
        ↓
AWS API Gateway (AWS-managed)
        ↓
CAPI Service (Customer API Building Block)
```

**CAPI Service Responsibilities:**
- **Primary Authentication**: Validates customer credentials using AWS IAM
- **Authorization Enforcement**: Checks customer permissions for requested operations
- **Request Routing**: Directs requests to appropriate backend services

#### 2. Cross-Account Integration Layer
```
CAPI Service (Account A)
        ↓
Paperwork Framework (Cross-Account Bridge)
        ↓ 
TSKronos Lambda Function (Account B)
```

**Paperwork Framework Purpose:**
- **Cross-Account Security**: Enables secure service-to-service communication across AWS accounts
- **Role-Based Access**: Uses IAM roles with external ID conditions for authentication
- **Service Discovery**: Automatically locates the correct Lambda function endpoints
- **Multi-Version Support**: Supports multiple authentication patterns (v1, v2, v3) for backward compatibility

#### 3. Core Processing Layer
```
Lambda Function: TSKronosWebService-CoralLambdaFunction
        ↓
Execution Role: TSKronosWebServiceCLERole
        ↓
Business Logic Execution
        ↓
AWS Services Integration
```

**Lambda Function Capabilities:**
- **Business Logic Implementation**: All Timestream InfluxDB API operations
- **Resource Orchestration**: Coordinates operations across multiple AWS services
- **Security Token Management**: Handles FAS token encryption/decryption using KMS

**CLE Role Permissions:**
- **Core AWS Services**: DynamoDB (metadata), S3 (configurations), StepFunctions (workflows)
- **Security Services**: SecretsManager (credentials), KMS (encryption keys)
- **Compute Services**: EC2 (instance management), Lambda (function invocation)
- **Building Block Access**: Alameda Orchestra, Metadata service, Deploy service

#### 4. Monitoring and Observability Layer
```
Lambda Execution
        ↓
CloudWatch Logs (/aws/lambda/functionName)
        ↓
CloudWatch Alarms (Memory, Errors, Logscan)
        ↓
Operational Alerting & Response
```

**Monitoring Components:**
- **Performance Metrics**: Memory utilization, execution duration, invocation rates
- **Error Detection**: Automatic log scanning for ERROR/FATAL patterns
- **Deployment Safety**: Blue-green deployment monitoring with automatic rollback
- **Operational Alerting**: Automatic ticket creation for critical issues
- **Long-term Retention**: Configurable log retention (1 month dev, 10 years prod)

#### 5. Integration Testing Layer
```
CI/CD Pipeline
        ↓
HydraStack (Integration Test Framework)
        ↓
Multiple Test Suites (CRUD, AuthZ, Security, CloudTrail)
        ↓
Production Readiness Validation
```

**Hydra Testing Framework:**
- **End-to-End Testing**: Complete API workflow validation
- **Security Compliance**: Taj security tests for regulatory compliance
- **Cross-Service Validation**: Integration testing with dependent services
- **Canary Monitoring**: Production health checks and validation
- **Multi-Environment Support**: Testing across different deployment stages

---

## Complete Request Flow Analysis

### Current Java CDK Request Flow

#### Step 1: Customer Request Initiation
```mermaid
sequenceDiagram
    participant Customer as Customer Application
    participant Gateway as AWS API Gateway
    participant CAPI as CAPI Service
    
    Customer->>Gateway: API Request (CreateDatabase)
    Gateway->>CAPI: Route Request
    CAPI->>CAPI: Authenticate Customer
    CAPI->>CAPI: Authorize Request
    CAPI->>CAPI: Apply Rate Limiting
```

**What Happens:**
1. **Customer Authentication**: AWS IAM validates customer credentials
2. **Request Validation**: API Gateway validates request format and parameters
3. **Rate Limiting**: CAPI enforces per-customer rate limits
4. **Authorization Check**: CAPI verifies customer has permission for the operation

#### Step 2: Cross-Account Service Invocation
```mermaid
sequenceDiagram
    participant CAPI as CAPI Service
    participant Paperwork as Paperwork Framework
    participant Lambda as TSKronos Lambda
    
    CAPI->>Paperwork: AssumeRole (CapiPaperworkExecutionRole)
    Paperwork->>Paperwork: Validate External ID
    Paperwork->>Lambda: Invoke Function
    Lambda->>Lambda: Execute Business Logic
```

**What Happens:**
1. **Role Assumption**: CAPI assumes CapiPaperworkExecutionRole with external ID validation
2. **Security Verification**: Paperwork validates the external ID condition ('kronos:*')
3. **Function Invocation**: Lambda function receives the request payload
4. **Context Setup**: Lambda establishes execution context with CLE role

#### Step 3: Core Business Logic Execution
```mermaid
sequenceDiagram
    participant Lambda as Lambda Function
    participant CLE as CLE Execution Role
    participant KMS as CapiFasEncryptionKey
    participant Services as AWS Services
    
    Lambda->>CLE: Assume Execution Role
    Lambda->>KMS: Decrypt FAS Tokens
    Lambda->>Services: DynamoDB/S3/StepFunctions Operations
    Lambda->>Services: Building Block Integrations
```

**What Happens:**
1. **Role Assumption**: Lambda assumes TSKronosWebServiceCLERole for AWS service access
2. **Token Decryption**: FAS tokens are decrypted using CapiFasEncryptionKey
3. **Service Operations**: Database metadata operations via DynamoDB, configuration via S3
4. **Workflow Orchestration**: Complex operations via StepFunctions
5. **Building Block Integration**: Calls to Alameda Orchestra, Metadata services

#### Step 4: Response and Monitoring
```mermaid
sequenceDiagram
    participant Lambda as Lambda Function
    participant Logs as CloudWatch Logs
    participant Alarms as CloudWatch Alarms
    participant Customer as Customer
    
    Lambda->>Logs: Write Execution Logs
    Lambda->>Customer: Return Response
    Logs->>Alarms: Trigger Metric Filters
    Alarms->>Alarms: Evaluate Alarm Conditions
```

**What Happens:**
1. **Response Generation**: Lambda formats and returns the API response
2. **Logging**: All execution details logged to CloudWatch
3. **Metric Generation**: Performance and error metrics collected
4. **Alarm Evaluation**: CloudWatch alarms evaluate against thresholds

### New CBB Request Flow

The CBB (Custom Building Block) version maintains identical business logic while using parallel infrastructure:

#### Key Differences in CBB Flow:
1. **Parallel Resource Names**: All AWS resources have `-cbb` suffix
2. **Identical Business Logic**: Same Lambda code, same AWS service interactions
3. **Isolated Infrastructure**: Complete resource isolation during migration
4. **Same External Interface**: No changes visible to customers

#### CBB Resource Mapping:
```
Java CDK Resources                    →    CBB Resources
├── CapiPaperworkExecutionRole       →    CapiPaperworkExecutionRole-cbb
├── TSKronosWebService-Lambda        →    TSKronosWebService-Lambda-cbb
├── TSKronosWebServiceCLERole        →    TSKronosWebServiceCLERole-cbb
├── CapiFasEncryptionKey             →    CapiFasEncryptionKey-cbb
└── CloudWatch Resources             →    CloudWatch Resources-cbb
```

---

## Traffic Switching Mechanism

### Overview of Switch Strategy

The traffic switch operates on a **single configuration change** principle - updating the CAPI service configuration to point to new Paperwork execution roles triggers the entire resource chain automatically.

### Switch Implementation:

#### CAPI Configuration Switch

**Configuration Change:**
```yaml
# BEFORE (Java CDK)
paperwork_execution_roles:
  - arn:aws:iam::ACCOUNT:role/CapiPaperworkExecutionRole
  - arn:aws:iam::ACCOUNT:role/CapiPaperworkExecutionRole_v2
  - arn:aws:iam::ACCOUNT:role/CapiPaperworkExecutionRole_v3

# AFTER (CBB)
paperwork_execution_roles:
  - arn:aws:iam::ACCOUNT:role/CapiPaperworkExecutionRole-cbb
  - arn:aws:iam::ACCOUNT:role/CapiPaperworkExecutionRole-cbb_v2
  - arn:aws:iam::ACCOUNT:role/CapiPaperworkExecutionRole-cbb_v3
```

**Automatic Chain Reaction:**
1. **CAPI Discovery**: CAPI service discovers and uses new `-cbb` suffixed roles
2. **New Role Usage**: CAPI assumes CapiPaperworkExecutionRole-cbb instead of original
3. **Lambda Invocation**: New role invokes TSKronosWebService-CoralLambdaFunction-cbb
4. **Execution Context**: New Lambda uses TSKronosWebServiceCLERole-cbb execution role
5. **Resource Access**: New execution role accesses CapiFasEncryptionKey-cbb for encryption
6. **Monitoring**: All CloudWatch logs and alarms automatically use CBB resources


#### Execution Plan:

**Process:**
1. **Deploy CBB (Green)**: Complete CBB infrastructure deployment
2. **Validation Testing**: Comprehensive testing of CBB resources
3. **Traffic Switch**: Instant 100% traffic switch to CBB
4. **Monitoring Period**: Extended monitoring of CBB performance
5. **Cleanup**: Removal of Java CDK (Blue) resources after validation

### Critical Dependencies During Switch

#### Paperwork Role Dependencies
- **Policy Accuracy**: CapiPaperworkExecutionRole-cbb must have identical lambda:InvokeFunction permissions
- **External ID Validation**: Correct external ID conditions for CAPI service authentication
- **Resource ARN Accuracy**: Policies must reference correct CBB Lambda function ARNs

#### Lambda Execution Role Dependencies
- **Permission Parity**: TSKronosWebServiceCLERole-cbb must have all existing AWS service permissions
- **KMS Access**: Decrypt permissions on CapiFasEncryptionKey-cbb
- **Building Block Access**: Maintained access to Alameda BB, Metadata BB, SDC, ARS services

#### KMS Key Dependencies
- **Key Policy Alignment**: CapiFasEncryptionKey-cbb must have identical key policies
- **Service Principal Access**: CAPI service principals must have encrypt permissions
- **Lambda Role Access**: Lambda execution role must have decrypt permissions

#### Environment Variable Dependencies
- **Automatic ARN Resolution**: Environment variables automatically resolve to new CBB resource ARNs
- **Configuration Consistency**: All environment variables maintain same values except resource references
- **No Lambda Code Changes**: Business logic remains completely unchanged

---

## Resource Management and Conflict Resolution

### Resources Requiring Manual Suffix Addition

#### CloudFormation Stacks (4 Resources)
| **Current Name** | **New Name with Suffix** |
|------------------|--------------------------|
| TSKronosWebServiceInfra-{stage}-{region} | TSKronosWebServiceInfra-{stage}-{region}-cbb |
| TSKronosWebServiceAPI-{stage}-{region} | TSKronosWebServiceAPI-{stage}-{region}-cbb |
| TSKronosSdbbConfiguration-{stage}-{region} | TSKronosSdbbConfiguration-{stage}-{region}-cbb |
| TSKronosWebServiceHydraStack-{stage} | TSKronosWebServiceHydraStack-{stage}-cbb |

#### IAM Roles (11 Resources)
| **Current Name** | **New Name with Suffix** |
|------------------|--------------------------|
| TSKronosWebServiceCLERole | TSKronosWebServiceCLERole-cbb |
| sdbbPatchWorkflowRole | sdbbPatchWorkflowRole-cbb |
| CapiAuthRole | CapiAuthRole-cbb |
| CapiTagrisRole | CapiTagrisRole-cbb |
| CapiTagrisRole_v2 | CapiTagrisRole-cbb_v2 |
| CapiTagrisRole_v3 | CapiTagrisRole-cbb_v3 |
| CapiPaperworkExecutionRole | CapiPaperworkExecutionRole-cbb |
| CapiPaperworkExecutionRole_v2 | CapiPaperworkExecutionRole-cbb_v2 |
| CapiPaperworkExecutionRole_v3 | CapiPaperworkExecutionRole-cbb_v3 |
| HydraInvocationRole-{buildingBlockName}-{stage} | HydraInvocationRole-{buildingBlockName}-{stage}-cbb |

#### Lambda Function Resources (4 Resources)
| **Current Name** | **New Name with Suffix** |
|------------------|--------------------------|
| TSKronosWebService-CoralLambdaFunction | TSKronosWebService-CoralLambdaFunction-cbb |
| /aws/lambda/{functionName}Log | /aws/lambda/{functionName}Log (LogGroup name) |
| live (Lambda alias) | live (on new CBB function) |
| CoralLambdaDeploymentGroup | CoralLambdaDeploymentGroup-cbb |

#### KMS Keys (1 Resource)
| **Current Name** | **New Name with Suffix** |
|------------------|--------------------------|
| CapiFasEncryptionKey | CapiFasEncryptionKey-cbb |

#### CloudWatch Resources (5 Resources)
| **Current Name** | **New Name with Suffix** |
|------------------|--------------------------|
| NewFunctionSuccessRateAlarm-{serviceName} | NewFunctionSuccessRateAlarm-{serviceName}-cbb |
| OverallFunctionSuccessRateAlarm-{serviceName} | OverallFunctionSuccessRateAlarm-{serviceName}-cbb |
| [{stage}][{cellIdentifier}] {functionName} memory utilization alarm | [{stage}][{cellIdentifier}] {functionName}-cbb memory utilization alarm |
| [{stage}][{cellIdentifier}] Logscan Alarm for {functionName} | [{stage}][{cellIdentifier}] Logscan Alarm for {functionName}-cbb |

#### CDK Construct IDs (2 Resources)
| **Current Name** | **New Name with Suffix** |
|------------------|--------------------------|
| HydraTestRunResources | HydraTestRunResources-cbb |

**Total: 24 resources requiring manual suffix addition**

---

## Automatic vs Manual Resource Updates

### Resources That Update Automatically (No Code Changes Required)

#### 1. Lambda Function Metrics and Dimensions
**Why Automatic**: Metrics use dynamic Lambda function properties, not hardcoded strings

**Current Metrics:**
```yaml
FunctionName: "TSKronosWebService-CoralLambdaFunction"
Resource: "TSKronosWebService-CoralLambdaFunction:live"
```

**CBB Metrics (Automatic):**
```yaml
FunctionName: "TSKronosWebService-CoralLambdaFunction-cbb"
Resource: "TSKronosWebService-CoralLambdaFunction-cbb:live"
```

**Technical Explanation**: CDK uses `lambdaFunction.functionName` property in metric creation, which automatically reflects the new CBB function name.

#### 2. Environment Variable ARN References
**Why Automatic**: Environment variables use parameter injection, not static constants

**Current Environment Variables:**
```typescript
CAPI_FAS_ENCRYPTION_KEY_ARN: {existing-kms-key-arn}
```

**CBB Environment Variables (Automatic):**
```typescript
CAPI_FAS_ENCRYPTION_KEY_ARN: {new-cbb-kms-key-arn}
```

**Technical Explanation**: The `capiFasEncryptionKeyArn` parameter comes from the CBB InfraStack, automatically providing the CBB KMS key ARN.

#### 3. Paperwork Role Lambda ARN References
**Why Automatic**: Lambda ARNs are dynamically generated and stored in arrays

**Process Flow:**
1. CBB Lambda function created with `-cbb` suffix name
2. CDK automatically generates CBB Lambda ARN
3. CBB Lambda ARN added to `cellularLambdaArns` array
4. Paperwork roles automatically reference CBB Lambda ARN in policies

### Resources Requiring Manual Updates

#### 1. Resource Constants
**Why Manual**: New constants needed for CBB resources

**Required Additions:**
```typescript
export const CORAL_LAMBDA_FUNCTION_NAME_CBB = '%s-CoralLambdaFunction-cbb';
export const FAS_ENCRYPTION_KMS_KEY_ALIAS_CBB = 'alias/FasEncryptionKey-cbb';
export const CapiFasEncryptionKeyCbb = 'CapiFasEncryptionKey-cbb';
```

### Shared Resources (No Changes Needed)

#### Certificate Secret Encryption Key
**Resource**: `SECRET_ENCRYPTION_KMS_KEY_ALIAS_ARN`
**Why No Change**: Points to shared `CertificateSecretEncryptionKey` used by both systems
**Technical Explanation**: Certificate encryption should remain shared to maintain certificate interoperability between Java CDK and CBB systems.

---

### Monitoring and Alerting Integration

#### CloudWatch Metrics and Alarms Automation
**Implementation Status: Fully Automatic**
```
        error: lambdaFunction.metricErrors({
            dimensionsMap: {
                FunctionName: lambdaFunction.functionName,  // Dynamic property
                Resource: `${lambdaFunction.functionName}:${alias.aliasName}`  // Template literal
            }
        })
    }
});
```

**Automatic Update Process:**
1. CBB Lambda function created with `-cbb` suffix
2. `lambdaFunction.functionName` property contains CBB name
3. Metrics automatically use CBB function name in dimensions
4. Template literals automatically include CBB suffix in Resource dimension

**Result - No Manual Changes Required:**
- All metric dimensions automatically reference CBB Lambda function
- Alarm names automatically include CBB suffix
- No hardcoded strings need updating



**Automatic Update Chain:**
1. **CBB Lambda Creation**: Function created with `-cbb` suffix name
2. **LambdaMonitor Instantiation**: Monitor receives CBB Lambda function object
3. **Property Resolution**: `this.lambdaFunction.functionName` contains CBB name
4. **Alarm Creation**: Alarm names automatically include CBB function name

**No Manual Updates Required**: Property-based naming ensures automatic updates without code changes.

---

## Summary and Recommendations

### Migration Strategy Summary

1. **Deploy CBB Infrastructure**: Create all CBB resources with `-cbb` suffixes alongside existing Java CDK resources
2. **Validate CBB Resources**: Test CBB resources in isolation before traffic switch
3. **Execute Traffic Switch**: Update CAPI configuration to use CBB Paperwork execution roles
4. **Monitor CBB Performance**: Extended monitoring period to ensure CBB system stability
5. **Clean Up Java CDK**: Remove Java CDK resources after successful validation period

### Key Success Factors

- **Infrastructure as Code Benefits**: CDK's automatic dependency resolution minimizes manual changes
- **Resource Isolation**: Suffix strategy ensures complete isolation during migration
- **Single Point of Switch**: CAPI configuration change triggers entire resource chain
- **Zero Downtime**: Both systems coexist during migration with instant rollback capability
- **Minimal Code Changes**: Most resources update automatically through property references

### Risk Mitigation

- **Gradual Migration Options**: Multiple traffic switching strategies available
- **Comprehensive Testing**: Hydra integration tests validate all functionality
- **Monitoring Coverage**: Complete observability during and after migration
- **Rollback Capability**: Immediate rollback through CAPI configuration reversion
- **Resource Cleanup**: Systematic cleanup process after validation period

This architecture ensures a robust, zero-downtime migration from Java CDK to TypeScript CBB while maintaining full functionality and operational excellence.
