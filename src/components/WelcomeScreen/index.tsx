import './WelcomeScreen.css'

export default function WelcomeScreen() {
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <h1 className="welcome-title">智能寻源比价助手</h1>
        <p className="welcome-subtitle">
          您好，我是中国移动智能寻源助手
          <br />
          请上传采购方案或项目立项书，我将为您提供专业的比价分析
        </p>
      </div>
    </div>
  )
}
