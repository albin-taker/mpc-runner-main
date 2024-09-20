@Library('common-lib') _

def builder = new com.abm.cicd.front.web.build()
def yamlFile = builder.get_web_node18_yaml()


pipeline {
  environment {
    DING_DING_ROBOT = 'safematrix'

    K8S_SVC_NAME = 'web-mpc-runner-home'
    IMAGE_NAME = 'web-mpc-runner-home'

    PROD_WEB_URL = 'https://infosat.io/'
    TEST_WEB_URL = 'https://test.infosat.io/'

    OUT_PUT_PATH = 'src'
    RUN_PROD = 'build'
    RUN_TEST = ''

    BASE_REPO = 'registry.cn-hangzhou.aliyuncs.com/abmatrix'

    BUILD_PATH = '/web-docker/web'
  }

  agent {
    kubernetes {
      yaml yamlFile
    }
  }

  parameters {
    booleanParam(name: 'isFull', defaultValue: false, description: '是否需要清理 node_modules 进行编译')
  }

  stages {

    stage('编译') {
      steps {
        container('node') {
          script {
            builder.build_web_node_yarn_package_custom("yarn config set ignore-engines true && yarn --registry https://registry.npmmirror.com")
          }
        }
      }
    }

    stage('构建镜像') {
      environment {
        ABM_REGISTRY = credentials('c5425e91-91d8-4084-8011-82c6497cd40a')
      }
      steps {
        container('image-builder') {
          script {
            def profile
            if (env.BRANCH_NAME ==~ /(.*master.*)|(.*main.*)/) {
              echo "(正式环境) 构建"
              profile = 'prod'
            } else {
              echo "(测试环境) 构建"
              profile = 'test'
            }

            echo "登录私库"
            sh "docker login registry.cn-hangzhou.aliyuncs.com -u $ABM_REGISTRY_USR -p $ABM_REGISTRY_PSW"

            echo "构建镜像"
            sh "docker build -t $BASE_REPO/$IMAGE_NAME:${profile} ."

            echo "推送镜像"
            sh "docker push $BASE_REPO/$IMAGE_NAME:${profile}"
          }
        }
      }
    }

    stage('部署更新服务') {
      environment {
        K8S_MASTER_IP = credentials('jiaxing-prod-k8s-master-ip')
        K8S_MASTER = credentials('jiaxing-prod-k8s-auth')
        // K8S_MASTER_IP = credentials('jiaxing-k8s-master-ip')
        // K8S_MASTER = credentials('381816aa-abe9-4a66-8842-5f141dff42b4')
      }
      steps {
        container('sshpass') {
          script {
            builder.deploy_web_package_image()
          }
        }
      }
    }
  }

  post {

    success {
      wrap([$class: 'BuildUser']) {
        script {
          builder.post_success_dingding_web_cicd_rst()
        }
      }
    }

    failure {
      wrap([$class: 'BuildUser']) {
        script {
          builder.post_failure_dingding_web_cicd_rst()
        }
      }
    }
  }
}
