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

### Complete Request Flow (Current Java CDK)

```mermaid
graph TD
    A[Customer API Call] --> B[AWS API Gateway]
    B --> C[CAPI Service]
    C --> D[AssumeRole: CapiPaperworkExecutionRole]
    D --> E[Paperwork Framework]
    E --> F[Lambda: TSKronosWebService-CoralLambdaFunction]
    F --> G[Execution Role: TSKronosWebServiceCLERole]
    G --> H[KMS: CapiFasEncryptionKey Decrypt]
    H --> I[Business Logic Processing]
    I --> J[AWS Services: DynamoDB/S3/StepFunctions]
    I --> K[Building Blocks: Alameda/Metadata]
    I --> L[CloudWatch Logs]
    L --> M[CloudWatch Alarms]
    M --> N[CodeDeploy Monitoring]
```

### New Architecture (CBB with Suffix Strategy)

The CBB version creates **parallel infrastructure** with `-cbb` suffixes:

```mermaid
graph TD
    A[Customer API Call] --> B[AWS API Gateway]
    B --> C[CAPI Service]
    C --> D[AssumeRole: CapiPaperworkExecutionRole-cbb]
    D --> E[Paperwork Framework]
    E --> F[Lambda: TSKronosWebService-CoralLambdaFunction-cbb]
    F --> G[Execution Role: TSKronosWebServiceCLERole-cbb]
    G --> H[KMS: CapiFasEncryptionKey-cbb Decrypt]
    H --> I[Business Logic Processing - SAME CODE]
    I --> J[AWS Services: DynamoDB/S3/StepFunctions - SAME]
    I --> K[Building Blocks: Alameda/Metadata - SAME]
    I --> L[CloudWatch Logs: /aws/lambda/functionName-cbbLog]
    L --> M[CloudWatch Alarms: memory-cbb, logscan-cbb]
    M --> N[CodeDeploy: CoralLambdaDeploymentGroup-cbb]
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
